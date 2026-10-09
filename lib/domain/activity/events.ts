/**
 * Kurum etkinliği zaman çizelgesi (Aktivite geçmişi → "Kurum etkinliği") — saf parçalar; testler events.test.ts.
 *
 * İki kaynak, tek zaman çizelgesi (lib/server/edoras-usage.ts → listInstitutionEvents, SALT OKUMA):
 *   • ETKİNLİK: kurumların öğretmen / yönetici etkinlikleri (yoklama, ödev, deneme, konu işleme, duyuru, elle SMS) Edoras
 *     tablolarından türetilir.
 *   • ÖNEMLİ İŞLEM (2026-10-09, F3): silme, yetki değişikliği, kurumdan çıkarma, şifre sıfırlama, deneme yayını… — bunlar
 *     tablolarda iz bırakmadığı için Edoras paneli `activity_logs`'a (migration 312) yazar. Tür adı = eylemin büyük harfi.
 * Satırda zaman, kurum, olay türü, (varsa) sayı, işlemi yapan PERSONELİN adı + rolü ve kısa ayrıntı (sınıf / deneme /
 * öğretmen adı, öğrenci NUMARASI) bulunur. Öğrenci / veli adı ya da kişisel veri taşınmaz.
 */
import { z } from "zod";
import { addDays, daysBetween, isIsoDate, todayIso } from "@/lib/domain/institutions/rules";

export const ACTIVITY_EVENT_TYPES = [
  "ATTENDANCE_TAKEN",
  "ASSIGNMENT_CREATED",
  "EXAM_CREATED",
  "EXAM_RESULTS_PUBLISHED",
  "LESSON_TOPIC_LOGGED",
  "ANNOUNCEMENT_CREATED",
  "SMS_SENT",
] as const;

/**
 * Edoras `activity_logs.action` değerlerinin büyük harfi (edoras-admin `lib/activity-log.ts`). Edoras'a yeni eylem eklenirse
 * buraya + `activity.tr.json` events.types'a eklenir; listede olmayan eylem gösterilmez.
 */
export const IMPORTANT_EVENT_TYPES = [
  "TEACHER_CREATED",
  "TEACHER_REMOVED",
  "TEACHER_ACTIVATED",
  "TEACHER_DEACTIVATED",
  "TEACHER_PERMISSIONS_CHANGED",
  "PERMISSION_PRESET_CHANGED",
  "PERMISSION_PRESET_DELETED",
  "TEACHER_CREDENTIALS_RESET",
  "STUDENT_DELETED",
  "STUDENT_ACTIVATED",
  "STUDENT_DEACTIVATED",
  "STUDENT_PASSWORD_RESET",
  "PARENT_PASSWORD_RESET",
  "PARENT_CREDENTIALS_SENT",
  "CLASS_DELETED",
  "EXAM_DELETED",
  "EXAM_RESULTS_PUBLISHED_BY",
  "EXAM_RESULTS_UNPUBLISHED",
  "TIMETABLE_ACTIVATED",
  "TIMETABLE_DELETED",
  "ATTENDANCE_OVERRIDDEN",
  "ANNOUNCEMENT_DELETED",
] as const;
export type ImportantEventType = (typeof IMPORTANT_EVENT_TYPES)[number];

export const INSTITUTION_EVENT_TYPES = [...ACTIVITY_EVENT_TYPES, ...IMPORTANT_EVENT_TYPES] as const;
export type InstitutionEventType = (typeof INSTITUTION_EVENT_TYPES)[number];

/** Tür süzgecinde "tüm önemli işlemler" (URL ?type=IMPORTANT). */
export const IMPORTANT_GROUP = "IMPORTANT";

const IMPORTANT_SET: ReadonlySet<string> = new Set(IMPORTANT_EVENT_TYPES);
export const isImportantEventType = (type: string): type is ImportantEventType => IMPORTANT_SET.has(type);

/**
 * `activity_logs.action` → olay türü. `exam_results_published` ETKİNLİK tarafındaki EXAM_RESULTS_PUBLISHED (exams sütunundan,
 * yalnız ilk yayın) ile çakışmasın diye EXAM_RESULTS_PUBLISHED_BY olur — bu satır her yayını ve yapanı kesin taşır.
 */
export function actionToEventType(action: string): ImportantEventType | null {
  const type = action === "exam_results_published" ? "EXAM_RESULTS_PUBLISHED_BY" : action.toUpperCase();
  return isImportantEventType(type) ? type : null;
}

export function eventTypeToAction(type: ImportantEventType): string {
  return type === "EXAM_RESULTS_PUBLISHED_BY" ? "exam_results_published" : type.toLowerCase();
}

/** Önemli işlem satırının kısa ayrıntısı — metni arayüz kurar (activity.tr.json events.detail.<kind>). */
export type EventDetail =
  | { kind: "name"; values: { name: string } }
  | { kind: "studentNo"; values: { no: string } }
  | { kind: "timetable"; values: { label: string; count: number } }
  | { kind: "attendance"; values: { date: string; hour: number } }
  | { kind: "parents"; values: { count: number } };

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, 120) : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * `activity_logs.details` + çözülen ad (öğretmen / deneme) → ayrıntı. `entityName` yalnız personel ya da deneme adıdır
 * (öğrenci / veli adı ÇÖZÜLMEZ). Tanınmayan biçim → null (satır ayrıntısız gösterilir).
 */
export function buildEventDetail(action: string, details: unknown, entityName: string | null): EventDetail | null {
  const d = details && typeof details === "object" && !Array.isArray(details) ? (details as Record<string, unknown>) : {};
  if (action === "timetable_activated") {
    const label = text(d.label);
    const count = num(d.activatedCount);
    return label && count !== null ? { kind: "timetable", values: { label, count } } : null;
  }
  if (action === "attendance_overridden") {
    const date = text(d.date);
    const hour = num(d.lessonHour);
    return date && hour !== null ? { kind: "attendance", values: { date, hour } } : null;
  }
  if (action === "parent_credentials_sent" && d.bulk === true) {
    const count = num(d.changedCount);
    return count !== null ? { kind: "parents", values: { count } } : null;
  }
  if (action.startsWith("student_")) {
    const no = text(d.studentNo);
    return no ? { kind: "studentNo", values: { no } } : null;
  }
  const name = entityName ?? text(d.name);
  return name ? { kind: "name", values: { name } } : null;
}

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
  /** İşlemi yapan PERSONELİN adı (yönetici / öğretmen); bilinmiyorsa null. */
  actorName: string | null;
  /** Yoklamada işaretlenen öğrenci sayısı, SMS'te alıcı sayısı; diğerlerinde null. */
  count: number | null;
  /** Yalnız önemli işlemlerde: ne üzerinde yapıldı. */
  detail: EventDetail | null;
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
  .transform((list) => list.flatMap((t) => (t === IMPORTANT_GROUP ? [...IMPORTANT_EVENT_TYPES] : [t])))
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
