/**
 * Randevu (statü "Randevu Planlandı") — saf yardımcılar: varsayılanlar, doğrulama, İstanbul saati ↔ epoch,
 * gecikme, sıradaki randevu ve takvim (.ics) dosyası. DeepSportAdmin lib/domain/crm/appointment.ts'ten; görev notu
 * biçimi atıldı (CRM'de randevu kendi tablosunda: supabase/migrations/20261005130000_crm_appointments.sql).
 *
 * Saat dilimi her yerde Europe/Istanbul: Türkiye 2016'dan beri sürekli UTC+3 (yaz saati yok), bu yüzden
 * dönüşüm sabit +03:00 ile yapılır.
 */
import { z } from "zod";
import { isIsoDate } from "@/lib/domain/institutions/rules";

export const APPOINTMENT_MODES = ["ONLINE", "IN_PERSON"] as const;
export type AppointmentMode = (typeof APPOINTMENT_MODES)[number];

export const APPOINTMENT_STATUSES = ["SCHEDULED", "HELD", "NO_SHOW", "CANCELLED"] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

/** Açık randevuyu kapatan sonuçlar. */
export const APPOINTMENT_OUTCOMES = ["HELD", "NO_SHOW", "CANCELLED"] as const;
export type AppointmentOutcome = (typeof APPOINTMENT_OUTCOMES)[number];

export const APPOINTMENT_TZ = "Europe/Istanbul";
const OFFSET_MS = 3 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

export const DEFAULT_APPOINTMENT_TIME = "10:00";
export const DEFAULT_APPOINTMENT_MINUTES = 60;
export const APPOINTMENT_TIME_STEP = 15;
export const APPOINTMENT_LINK_MAX = 500;
export const APPOINTMENT_LOCATION_MAX = 300;
export const APPOINTMENT_NOTE_MAX = 2000;

export interface Appointment {
  /** YYYY-MM-DD (İstanbul). */
  date: string;
  /** HH:mm (İstanbul). */
  time: string;
  mode: AppointmentMode;
  /** Toplantı linki (yalnız ONLINE). */
  link: string | null;
  /** Adres / yer (yalnız IN_PERSON). */
  location: string | null;
}

/** GET /api/crm/appointments satırı. */
export interface AppointmentDto extends Appointment {
  id: string;
  leadId: string;
  /** Adayın gösterim adı (kurum ya da yetkili). */
  leadName: string | null;
  note: string | null;
  status: AppointmentStatus;
  assigneeId: string | null;
  assigneeName: string | null;
  createdAt: number;
}

/** Formdaki ham değerler. */
export interface AppointmentDraft {
  date: string;
  time: string;
  mode: AppointmentMode;
  link: string;
  location: string;
  note: string;
}

export const isHhMm = (v: string): boolean => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
export const isAppointmentMode = (v: unknown): v is AppointmentMode => (APPOINTMENT_MODES as readonly unknown[]).includes(v);

// --- İstanbul saati ----------------------------------------------------------------------------

/** İstanbul tarih + saat → epoch ms. */
export function istanbulToMs(date: string, time: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return Date.UTC(y, m - 1, d, hh, mm) - OFFSET_MS;
}

/** Epoch ms → İstanbul tarih + saat. */
export function msToIstanbul(ms: number): { date: string; time: string } {
  const iso = new Date(ms + OFFSET_MS).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

export function appointmentMs(a: Pick<Appointment, "date" | "time">): number {
  return istanbulToMs(a.date, a.time);
}

/** 15 dakikalık adımlarla saat seçenekleri ("00:00" … "23:45"). */
export function appointmentTimes(step = APPOINTMENT_TIME_STEP): string[] {
  const out: string[] = [];
  for (let m = 0; m < 24 * 60; m += step) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  return out;
}

/** Randevu saati geçti mi (tarih + saat; gün değil). */
export function isAppointmentOverdue(a: Pick<Appointment, "date" | "time">, now: Date = new Date()): boolean {
  return appointmentMs(a) < now.getTime();
}

// --- Form --------------------------------------------------------------------------------------

/** Yüz yüze görüşmede yer önerisi: adayın ilçe, il bilgisi. */
export function leadPlace(lead: { city?: string | null; district?: string | null }): string {
  return [lead.district, lead.city]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(", ");
}

/** Yeni randevu: yarın 10:00, online; yer adayın il/ilçesiyle önden dolu (yüz yüze seçilirse görünür). */
export function defaultAppointmentDraft(lead: { city?: string | null; district?: string | null }, now: Date = new Date()): AppointmentDraft {
  const today = msToIstanbul(now.getTime()).date;
  const tomorrow = msToIstanbul(istanbulToMs(today, "12:00") + 24 * 60 * MINUTE_MS).date;
  return { date: tomorrow, time: DEFAULT_APPOINTMENT_TIME, mode: "ONLINE", link: "", location: leadPlace(lead), note: "" };
}

/** Var olan randevudan düzenleme formu. */
export function draftFromAppointment(a: Appointment, note = ""): AppointmentDraft {
  return { date: a.date, time: a.time, mode: a.mode, link: a.link ?? "", location: a.location ?? "", note };
}

/** Link: boş → null; şemasız ("meet.google.com/x") → https:// eklenir; geçersiz → undefined. */
export function normalizeMeetingLink(raw: string): string | null | undefined {
  const s = raw.trim();
  if (!s) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "https:" && u.protocol !== "http:") return undefined;
    if (!u.hostname.includes(".")) return undefined;
    return u.toString();
  } catch {
    return undefined;
  }
}

/** Takvimde var olan bir gün mü (2026-13-01 gibi değerler reddedilir). */
export function isRealDate(date: string): boolean {
  return isIsoDate(date) && msToIstanbul(istanbulToMs(date, "12:00")).date === date;
}

export type AppointmentDraftError = "date" | "time" | "past" | "link";

/** İlk hata (yoksa null). Geçmiş saat kabul edilmez. */
export function validateAppointmentDraft(d: AppointmentDraft, now: Date = new Date()): AppointmentDraftError | null {
  if (!isRealDate(d.date)) return "date";
  if (!isHhMm(d.time)) return "time";
  if (istanbulToMs(d.date, d.time) < now.getTime()) return "past";
  if (d.mode === "ONLINE" && normalizeMeetingLink(d.link) === undefined) return "link";
  return null;
}

/** Geçerli taslak → randevu (türe göre yalnız link ya da yer kalır). */
export function draftToAppointment(d: AppointmentDraft): Appointment {
  return {
    date: d.date,
    time: d.time,
    mode: d.mode,
    link: d.mode === "ONLINE" ? (normalizeMeetingLink(d.link) ?? null) : null,
    location: d.mode === "IN_PERSON" ? d.location.trim() || null : null,
  };
}

// --- Sıradaki randevu ve biçim -----------------------------------------------------------------

/** Adayın sıradaki randevusu: gelecekteki en yakın; yoksa en son geçmiş (henüz kapatılmamış) olan. */
export function nextAppointment<T extends { date: string; time: string }>(items: readonly T[], now: Date = new Date()): T | null {
  const sorted = [...items].sort((a, b) => appointmentMs(a) - appointmentMs(b));
  return sorted.find((x) => appointmentMs(x) >= now.getTime()) ?? sorted[sorted.length - 1] ?? null;
}

/** "12 Eki 14:30" (yerel ay kısaltmasıyla, İstanbul saatiyle). */
export function formatAppointmentWhen(a: Pick<Appointment, "date" | "time">, locale = "tr"): string {
  const day = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: APPOINTMENT_TZ }).format(new Date(appointmentMs(a)));
  return `${day} ${a.time}`;
}

// --- API gövdeleri (tek kaynak: istemci formu ve sunucu) ---------------------------------------

const MSG = { date: "Geçerli bir tarih seçin", time: "Geçerli bir saat seçin", link: "Geçerli bir link girin", tooLong: "Çok uzun" } as const;

const dateField = z.string().refine(isRealDate, MSG.date);
const timeField = z.string().refine(isHhMm, MSG.time);
const linkField = z
  .string()
  .trim()
  .max(APPOINTMENT_LINK_MAX, MSG.tooLong)
  .refine((v) => normalizeMeetingLink(v) !== undefined, MSG.link);
const locationField = z.string().trim().max(APPOINTMENT_LOCATION_MAX, MSG.tooLong);
const noteField = z.string().trim().max(APPOINTMENT_NOTE_MAX, MSG.tooLong);

/** Yeni randevu. Aktör (created_by) gövdeden okunmaz. */
export const appointmentCreateSchema = z.object({
  leadId: z.uuid(),
  date: dateField,
  time: timeField,
  mode: z.enum(APPOINTMENT_MODES),
  link: linkField.default(""),
  location: locationField.default(""),
  note: noteField.default(""),
  /** Boş = oturumdaki kişi. */
  assigneeId: z.uuid().nullable().optional(),
});
export type AppointmentCreateInput = z.input<typeof appointmentCreateSchema>;
export type AppointmentCreateValues = z.output<typeof appointmentCreateSchema>;

/**
 * Açık randevuyu yeniden planla (tarih/saat/tür/link/yer/not/atanan) YA DA kapat (`status`). İkisi bir arada olmaz.
 * Kapatırken yalnız `note` (sonuç notu) eklenebilir.
 */
export const appointmentPatchSchema = z
  .object({
    date: dateField,
    time: timeField,
    mode: z.enum(APPOINTMENT_MODES),
    link: linkField,
    location: locationField,
    note: noteField,
    assigneeId: z.uuid().nullable(),
    status: z.enum(APPOINTMENT_OUTCOMES),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "Değişiklik yok" })
  .refine((v) => v.status === undefined || Object.keys(v).every((k) => k === "status" || k === "note"), {
    message: "Kapatırken başka alan değiştirilemez",
  })
  .refine((v) => (v.date === undefined) === (v.time === undefined), { message: "Tarih ve saat birlikte verilir", path: ["time"] });
export type AppointmentPatchInput = z.input<typeof appointmentPatchSchema>;
export type AppointmentPatchValues = z.output<typeof appointmentPatchSchema>;

// --- Takvim dosyası (.ics, RFC 5545) -----------------------------------------------------------

const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const icsLocal = (ms: number) => {
  const { date, time } = msToIstanbul(ms);
  return `${date.replace(/-/g, "")}T${time.replace(":", "")}00`;
};
const icsUtc = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** 75 sekizliği aşan satırlar katlanır (UTF-8 karakter sınırında). */
function fold(line: string): string {
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  const limit = () => (out.length === 0 ? 75 : 74);
  for (const ch of line) {
    const b = new TextEncoder().encode(ch).length;
    if (bytes + b > limit()) {
      out.push(cur);
      cur = "";
      bytes = 0;
    }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export interface IcsInput {
  uid: string;
  title: string;
  appointment: Appointment;
  description?: string;
  durationMinutes?: number;
  /** DTSTAMP (test için). */
  now?: Date;
}

/** Tek etkinlikli takvim dosyası; saat Europe/Istanbul (VTIMEZONE dahil), varsayılan 1 saat. */
export function buildAppointmentIcs({ uid, title, appointment, description, durationMinutes, now }: IcsInput): string {
  const start = appointmentMs(appointment);
  const end = start + (durationMinutes ?? DEFAULT_APPOINTMENT_MINUTES) * MINUTE_MS;
  const desc = [description?.trim(), appointment.link].filter(Boolean).join("\n");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Edoras CRM//Randevu//TR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VTIMEZONE",
    `TZID:${APPOINTMENT_TZ}`,
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:+0300",
    "TZOFFSETTO:+0300",
    "TZNAME:+03",
    "END:STANDARD",
    "END:VTIMEZONE",
    "BEGIN:VEVENT",
    `UID:${uid.replace(/[^A-Za-z0-9._-]/g, "")}@edoras-crm`,
    `DTSTAMP:${icsUtc((now ?? new Date()).getTime())}`,
    `DTSTART;TZID=${APPOINTMENT_TZ}:${icsLocal(start)}`,
    `DTEND;TZID=${APPOINTMENT_TZ}:${icsLocal(end)}`,
    `SUMMARY:${icsText(title)}`,
    ...(desc ? [`DESCRIPTION:${icsText(desc)}`] : []),
    ...(appointment.location ? [`LOCATION:${icsText(appointment.location)}`] : []),
    ...(appointment.link ? [`URL:${appointment.link}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** "randevu-kurum-adi-2026-10-12.ics" */
export function appointmentIcsFileName(title: string, date: string): string {
  const slug = title
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `randevu-${slug || "crm"}-${date}.ics`;
}
