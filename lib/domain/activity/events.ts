/**
 * Kurum etkinliği zaman çizelgesi (Aktivite geçmişi → "Kurum etkinliği") — saf parçalar; testler events.test.ts.
 *
 * DeepSport'un Aktivite geçmişi son kullanıcı olaylarının (giriş, test…) denetim izidir. Edoras'ta böyle bir günlük yok;
 * yerine kurumların öğretmen / yönetici etkinlikleri (yoklama, ödev, deneme, konu işleme, duyuru, elle SMS) Edoras
 * tablolarından SALT OKUNARAK birleştirilir (lib/server/edoras-usage.ts → listInstitutionEvents). Öğrenci adı ya da kişisel
 * veri taşınmaz: satırda zaman, kurum, olay türü, (varsa) etkinlik sayısı ve kişinin ROLÜ bulunur.
 */
import { z } from "zod";
import { addDays, daysBetween, isIsoDate, todayIso } from "@/lib/domain/institutions/rules";

export const INSTITUTION_EVENT_TYPES = [
  "ATTENDANCE_TAKEN",
  "ASSIGNMENT_CREATED",
  "EXAM_CREATED",
  "EXAM_RESULTS_PUBLISHED",
  "LESSON_TOPIC_LOGGED",
  "ANNOUNCEMENT_CREATED",
  "SMS_SENT",
] as const;
export type InstitutionEventType = (typeof INSTITUTION_EVENT_TYPES)[number];

/** Olayı yapan kişinin kurumdaki rolü (institution_users.role); bilinmiyorsa null. Ad okunmaz. */
export type EventActorRole = "admin" | "teacher" | "other";

export interface InstitutionEvent {
  /** Kararlı: tür + kaynak satır kimliği. */
  id: string;
  /** ISO zaman damgası. */
  at: string;
  institutionId: string;
  institutionName: string;
  type: InstitutionEventType;
  actorRole: EventActorRole | null;
  /** Yoklamada işaretlenen öğrenci sayısı, SMS'te alıcı sayısı; diğerlerinde null. */
  count: number | null;
}

export interface InstitutionEventsResponse {
  items: InstitutionEvent[];
  /** Süzgece uyan toplam olay (okunabilen kaynaklarda). */
  total: number;
  /** Kaynak başına tür sayıları (süzgece uyan). */
  countsByType: Partial<Record<InstitutionEventType, number>>;
  page: number;
  size: number;
  /** Sayfa gezilebilecek en son sayfa (en yeni MAX_EVENT_ROWS olay ile sınırlı). */
  lastPage: number;
  /** Gerçekten uygulanan aralık (istenen 90 günü aşarsa kısaltılır). */
  window: { from: string; to: string; clamped: boolean };
  /** Okunamayan kaynaklar (izin / zaman aşımı); bunlar toplama girmez. */
  unavailable: InstitutionEventType[];
  /** Toplam, gezilebilir üst sınırı aşıyor. */
  truncated: boolean;
}

/** En çok 90 gün, varsayılan son 7 gün. */
export const MAX_EVENT_WINDOW_DAYS = 90;
export const DEFAULT_EVENT_WINDOW_DAYS = 7;
/** Bir kaynaktan tek istekte okunabilecek satır (PostgREST sınırı) → gezilebilir en fazla olay. */
export const MAX_EVENT_ROWS = 1000;
export const EVENT_PAGE_SIZES = [10, 20, 50, 100] as const;

export function resolveEventWindow(
  from: string | null | undefined,
  to: string | null | undefined,
  today: string = todayIso()
): { from: string; to: string; clamped: boolean } {
  const end = isIsoDate(to) && to <= today ? to : today;
  let start = isIsoDate(from) ? from : addDays(end, -(DEFAULT_EVENT_WINDOW_DAYS - 1));
  if (start > end) start = end;
  const clamped = daysBetween(start, end) + 1 > MAX_EVENT_WINDOW_DAYS;
  if (clamped) start = addDays(end, -(MAX_EVENT_WINDOW_DAYS - 1));
  return { from: start, to: end, clamped };
}

/** Türkiye günü [from, to] → zaman damgası aralığı [başlangıç, bitiş) (Türkiye kalıcı +03:00). */
export function istanbulRange(from: string, to: string): { start: string; end: string } {
  return { start: `${from}T00:00:00+03:00`, end: `${addDays(to, 1)}T00:00:00+03:00` };
}

const csvList = z
  .string()
  .optional()
  .transform((v) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : []))
  .transform((list) => [...new Set(list.filter((t): t is InstitutionEventType => (INSTITUTION_EVENT_TYPES as readonly string[]).includes(t)))]);

/** GET /api/activity/institution-events süzgeci. Sayfa × boyut gezilebilir sınırı aşarsa son gezilebilir sayfaya çekilir. */
export const institutionEventsQuerySchema = z
  .object({
    institutionId: z.uuid().optional().catch(undefined),
    types: csvList,
    from: z.string().optional(),
    to: z.string().optional(),
    page: z.coerce.number().int().min(0).catch(0),
    size: z.coerce.number().int().min(1).max(100).catch(20),
  })
  .transform((q) => {
    const lastPage = Math.max(0, Math.ceil(MAX_EVENT_ROWS / q.size) - 1);
    return { ...q, page: Math.min(q.page, lastPage), lastPage };
  });
export type InstitutionEventsQuery = z.output<typeof institutionEventsQuerySchema>;

interface EventRow {
  id: string;
  at: string;
}

/** Kaynak listelerini (her biri kendi içinde en yeniden eskiye, en az `offset + size` satır) birleştirip sayfayı keser. */
export function mergeEventPage<T extends EventRow>(perSource: readonly (readonly T[])[], offset: number, size: number): T[] {
  return perSource
    .flat()
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
    .slice(offset, offset + size);
}
