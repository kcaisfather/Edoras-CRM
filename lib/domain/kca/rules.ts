/**
 * Yönetim (KCA Panel) — saf kurallar. KCA Panel'in (lib/actions.js) aynı adlı yardımcılarıyla birebir aynı davranır:
 * iki panel aynı Turso verisini yazar, isim eşleştirme ve toplantı notu başlık satırları iki tarafta aynı okunmalı.
 */
import { addDays, todayIso } from "@/lib/domain/institutions/rules";

/** Türkçe duyarlı ad anahtarı: küçük harf, ı→i, aksan ve boşluk / noktalama atılır ("Ümit Abi" → "umitabi"). */
export function nameKey(s: string): string {
  return String(s)
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

/** Edoras etiketi: kökü bu adı taşıyan ana proje (ad "Edoras" → anahtar "edoras"). */
export const EDORAS_PROJECT_KEY = "edoras";

export function isEdorasRootName(name: string): boolean {
  return nameKey(name) === EDORAS_PROJECT_KEY;
}

/** Notun başındaki "#toplantı" kodu (KCA Panel MEETING_CODE). \b Türkçe harflerde çalışmaz. */
export const MEETING_CODE = /^\s*#topl[aâ]nt[ıi](?=[\s:]|$)[\s:]*/i;

export function stripMeetingCode(body: string): string {
  return String(body).replace(MEETING_CODE, "");
}

/** "14.10.2026", "14.10", "2026-10-14", "bugün", "dün", "yarın" → YYYY-MM-DD (okunamazsa null). */
export function parseTrDate(value: string, today: string = todayIso()): string | null {
  const s = String(value || "").trim().toLocaleLowerCase("tr");
  if (s.startsWith("bugün") || s.startsWith("bugun")) return today;
  if (s.startsWith("dün") || s.startsWith("dun")) return addDays(today, -1);
  if (s.startsWith("yarın") || s.startsWith("yarin")) return addDays(today, 1);
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return validYmd(`${m[1]}-${m[2]}-${m[3]}`);
  m = s.match(/^(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?/);
  if (!m) return null;
  const y = m[3] ? (m[3].length === 2 ? `20${m[3]}` : m[3]) : today.slice(0, 4);
  return validYmd(`${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`);
}

function validYmd(v: string): string | null {
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : null;
}

export interface ParsedMeetingHeader {
  date?: string | null;
  title?: string;
  company?: string;
  participants?: string;
}

/** Şablondaki başlık satırları (ilk 15 satır): Tarih, Konu, Firma, Katılanlar. Yazılmayan alan boş kalır. */
export function parseMeetingText(text: string, today: string = todayIso()): ParsedMeetingHeader {
  const out: ParsedMeetingHeader = {};
  for (const line of String(text).split("\n").slice(0, 15)) {
    const m = line.match(/^\s*[-*•]?\s*(tarih|konu|başlık|baslik|firma|proje|katılanlar|katilanlar|katılımcılar|katilimcilar|kişiler|kisiler)\s*:\s*(.+)$/i);
    if (!m) continue;
    const k = nameKey(m[1]);
    const v = m[2].trim();
    if (k === "tarih") out.date = parseTrDate(v, today);
    else if (k === "konu" || k === "baslik") out.title = v;
    else if (k === "firma" || k === "proje") out.company = v;
    else out.participants = v;
  }
  return out;
}

/** Konu verilmezse: "Anahtar: değer" olmayan ilk dolu satır (en çok 120 karakter). */
export function meetingFirstLine(body: string): string {
  return (String(body).split("\n").find((l) => l.trim() && !/^\s*[-*•]?\s*\S+\s*:/.test(l)) || "").trim().slice(0, 120);
}

/** Toplantı notu şablonu (KCA Panel CLAUDE.md "Toplantı notunun biçimi" — panel bu biçimi tablo ve başlıklarıyla gösterir). */
export function meetingTemplate(today: string = todayIso()): string {
  const [y, m, d] = today.split("-");
  return [
    `# Edoras — Toplantı Notları ${d}.${m}.${y}`,
    "Katılımcılar: ",
    "",
    "## Özet",
    "",
    "## Gündem notları",
    "### ",
    "- #1 ",
    "",
    "## Aksiyon planı",
    "| Not # | Aksiyon | Sorumlu | Öncelik | Hedef | Çıktı | Durum |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    "| 1 |  |  | Orta |  |  | Başlanmadı |",
    "",
    "## Görüşülecek kişiler",
    "| Kişi | Bağlantı | Amaç | Hazırlık | İstenecek |",
    "| --- | --- | --- | --- | --- |",
    "",
    "## Açık sorular",
    "- [ ] ",
    "",
    "## Bir sonraki toplantı",
    "",
  ].join("\n");
}

/** KCA Panel saatleri SQLite `datetime('now')` biçiminde UTC: "YYYY-MM-DD HH:MM:SS" → Date. */
export function parseKcaTimestamp(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(`${value.replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}
