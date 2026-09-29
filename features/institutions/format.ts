/** Kurum ekranları için biçimlendirme (yalnız Türkçe). */

const DATE = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const DATE_TIME = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Istanbul",
});

/** "2026-09-29" → "29 Eyl 2026". Gün değeri UTC olarak okunur (saat dilimi kayması olmaz). */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? "—" : DATE.format(date);
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : DATE_TIME.format(date);
}

/** "+905321234567" → "0532 123 45 67"; yabancı numara olduğu gibi. */
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return "—";
  const m = /^\+90(\d{3})(\d{3})(\d{2})(\d{2})$/.exec(e164);
  return m ? `0${m[1]} ${m[2]} ${m[3]} ${m[4]}` : e164;
}

export const PROGRAM_LABEL = { yks: "YKS", lgs: "LGS" } as const;

/** Program etiketi; kurum Edoras'ta yoksa program bilinmez. */
export function programLabel(program: keyof typeof PROGRAM_LABEL | null): string {
  return program ? PROGRAM_LABEL[program] : "—";
}
