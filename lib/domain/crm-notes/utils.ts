/**
 * Aday notu yardımcıları (DeepSportAdmin lib/domain/crm-notes/utils.ts'ten).
 *
 * DeepSport'ta ayrı alanı olmayan bazı kayıtlar not içeriğinin başındaki yapılandırılmış önekle
 * saklanıyordu: `[ETIKET|a|b|c] gövde`. EdorasCRM'de gerçek evi olanlar kolona/tabloya taşındı:
 *   TEKLIF, TAKIP  → crm_leads.offer_sent_at / next_follow_up_at / lost_reason (CRM_OFFER_FIELDS)
 *   TAHSILAT       → bağlı kurumun crm_payments satırları (COLLECTIONS)
 *   GOREV, ATAMA   → crm_tasks (elle atanan görev ve tamamlanan kural görevi satırları); sonuç notu düz
 *                    metin olarak crm_notes'a yazılır (supabase/migrations/20260929170000_crm_tasks.sql)
 *   DONDURMA, MEMNUNIYETSIZ → Edoras'ta karşılığı yok (paket dondurma yok; eski önek verisi yok)
 * Başka evi olana kadar önekle kalanlar (gövde düz metin kalır, önekli not her ekranda okunur):
 *   SIKAYET|kategori|önem|durum  → şikâyet kaydı (anket modülü gelene kadar; CRM_DISSATISFACTION_FIELD)
 *   DEVIR|takipTarihi            → satış → kurulum devir notu (G22)
 *   ILETISIM|kanal|şablon        → tek tık iletişim denemesi (G20; görüşme kaydı G50 gelene kadar)
 *   PROGRAM|erken|yillik         → erken yenileme / yıllık ön ödeme etiketi (G113)
 */

import type { CrmNote } from "./types";

export type NoteTag = "SIKAYET" | "DEVIR" | "ILETISIM" | "PROGRAM";

export interface ParsedNote {
  tag: NoteTag | null;
  args: string[];
  body: string;
}

const PREFIX = /^\[(SIKAYET|DEVIR|ILETISIM|PROGRAM)((?:\|[^|\]]*)*)\][ \t]*\n?/;

/** Veritabanında bu öneklerle başlayan notlar liste rozetleri için taranır (sunucu). */
export const COMPLAINT_PREFIX = "[SIKAYET|";
export const PROGRAM_PREFIX = "[PROGRAM|";

export function parseNoteContent(content: string): ParsedNote {
  const m = PREFIX.exec(content ?? "");
  if (!m) return { tag: null, args: [], body: content ?? "" };
  const args = m[2] ? m[2].slice(1).split("|") : [];
  return { tag: m[1] as NoteTag, args, body: content.slice(m[0].length) };
}

export function buildNoteContent(tag: NoteTag, args: string[], body: string): string {
  const safe = args.map((a) => a.replace(/[|\]\n]/g, " ").trim());
  const head = `[${[tag, ...safe].join("|")}]`;
  const text = body.trim();
  return text ? `${head}\n${text}` : head;
}

/** Notları tekilleştirip yeniden eskiye sıralar (birden çok kaynaktan gelen listeler için). */
export function mergeNotes<T extends Pick<CrmNote, "id" | "createdAt">>(lists: (T[] | undefined)[]): T[] {
  const byId = new Map<string, T>();
  for (const list of lists) for (const n of list ?? []) byId.set(n.id, n);
  return [...byId.values()].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

type NoteLike = Pick<CrmNote, "id" | "content" | "createdAt">;

// --- Şikâyet kaydı (G17 → madde 7) ---
// Kod adları (Dissatisfaction*) DeepSport sözleşmesiyle (CRM_DISSATISFACTION_FIELD) aynı kalır;
// arayüz etiketi "Şikâyet kaydı".

export const DISSATISFACTION_CATEGORIES = ["teknik", "kurulum", "lisans", "odeme", "egitim", "ozellik", "icerik"] as const;
export const DISSATISFACTION_SEVERITIES = ["dusuk", "orta", "yuksek", "kritik"] as const;
export const DISSATISFACTION_STATUSES = ["acik", "cozuldu"] as const;

export type DissatisfactionCategory = (typeof DISSATISFACTION_CATEGORIES)[number];
export type DissatisfactionSeverity = (typeof DISSATISFACTION_SEVERITIES)[number];
export type DissatisfactionStatus = (typeof DISSATISFACTION_STATUSES)[number];

export interface Dissatisfaction {
  category: DissatisfactionCategory;
  severity: DissatisfactionSeverity;
  status: DissatisfactionStatus;
  description: string;
  createdAt: number | null;
}

function oneOf<T extends string>(list: readonly T[], value: string | undefined, fallback: T): T {
  return (list as readonly string[]).includes(value ?? "") ? (value as T) : fallback;
}

export function isComplaintTag(tag: NoteTag | null): boolean {
  return tag === "SIKAYET";
}

/** En son şikâyet kaydı (açık ya da çözüldü); yoksa null. */
export function latestDissatisfaction(notes: NoteLike[] | undefined): Dissatisfaction | null {
  for (const note of mergeNotes([notes])) {
    const p = parseNoteContent(note.content);
    if (!isComplaintTag(p.tag)) continue;
    return {
      category: oneOf(DISSATISFACTION_CATEGORIES, p.args[0], "teknik"),
      severity: oneOf(DISSATISFACTION_SEVERITIES, p.args[1], "orta"),
      status: oneOf(DISSATISFACTION_STATUSES, p.args[2], "acik"),
      description: p.body,
      createdAt: note.createdAt,
    };
  }
  return null;
}

export function buildDissatisfactionNote(d: Omit<Dissatisfaction, "createdAt">): string {
  return buildNoteContent("SIKAYET", [d.category, d.severity, d.status], d.description);
}

export const latestComplaint = latestDissatisfaction;
export const buildComplaintNote = buildDissatisfactionNote;

// --- Devir notu (G22) ---

/** En son devir notundaki takip tarihi (YYYY-MM-DD); yoksa null. */
export function latestFollowUpDate(notes: NoteLike[] | undefined): string | null {
  for (const note of mergeNotes([notes])) {
    const p = parseNoteContent(note.content);
    if (p.tag === "DEVIR" && isIsoDate(p.args[0])) return p.args[0];
  }
  return null;
}

// --- Erken yenileme / yıllık ön ödeme etiketi (G113) ---

export const PROGRAM_TAGS = ["erken", "yillik"] as const;
export type ProgramTag = (typeof PROGRAM_TAGS)[number];

export function buildProgramNote(tags: ProgramTag[], body: string): string {
  const valid = PROGRAM_TAGS.filter((t) => tags.includes(t));
  return valid.length ? buildNoteContent("PROGRAM", valid, body) : body.trim();
}

/** Notlardaki tüm PROGRAM etiketleri (birleşim, sabit sırada). */
export function programTags(notes: Pick<CrmNote, "content">[] | undefined): ProgramTag[] {
  const found = new Set<string>();
  for (const note of notes ?? []) {
    const p = parseNoteContent(note.content);
    if (p.tag === "PROGRAM") p.args.forEach((a) => found.add(a));
  }
  return PROGRAM_TAGS.filter((t) => found.has(t));
}

// --- Tarih ---

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const isIsoDate = (v: string | null | undefined): v is string => ISO_DATE.test(v ?? "");
