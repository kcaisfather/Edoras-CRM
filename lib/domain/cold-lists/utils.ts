/**
 * Soğuk liste saf yardımcıları (DeepSport lib/domain/cold-lists/utils.ts + store.ts'in saf geçişleri): görünen ad,
 * mükerrer karşılaştırma biçimi, birleştirme, Görevlerim'e düşen kişiler, "Sıcağa taşı" notu.
 */
import type { ExistingContact } from "@/lib/import/duplicates";
import { normalizeImportEmail, normalizeImportPhone } from "@/lib/import/normalize";
import type { ImportRecord } from "@/lib/import/records";
import { phoneMatches, presenceMatches, sameText, textIncludes, type PresenceFilter } from "@/lib/utils/filter-match";
import type { ProspectPatchInput, ProspectTextField } from "./schemas";
import type { Prospect, ProspectOutcome } from "./types";

export function prospectName(p: Pick<Prospect, "firstName" | "lastName">): string {
  return [p.firstName, p.lastName].filter(Boolean).join(" ");
}

export function prospectTitle(p: Pick<Prospect, "firstName" | "lastName" | "organization" | "phoneRaw" | "emailRaw">): string {
  return prospectName(p) || p.organization || p.phoneRaw || p.emailRaw || "-";
}

/**
 * Taşınmış mı: "Sıcağa taşı" yapılmış (moved_at dolu). Aday sonradan silinse de taşınmış sayılır (görev üretmez,
 * sonucu değiştirilmez); yalnız adayı duran kişi yeniden taşınamaz (`canMove`).
 */
export const isMoved = (p: Pick<Prospect, "movedAt">): boolean => p.movedAt != null;

/** "Sıcağa taşı" açık mı: adayı duran kişi ikinci kez taşınamaz (SQL: CRM_PROSPECT_ALREADY_MOVED). */
export const canMove = (p: Pick<Prospect, "crmLeadId">): boolean => p.crmLeadId == null;

/** Adayın kimlik kuralı (crm_leads_identity_check): kurum adı ya da yetkilinin adı. */
export const hasLeadIdentity = (p: Pick<Prospect, "firstName" | "lastName" | "organization">): boolean =>
  !!(p.firstName || p.lastName || p.organization);

export function prospectToExisting(p: Prospect, listName?: string): ExistingContact {
  return {
    source: "coldList",
    id: p.id,
    name: prospectTitle(p),
    organization: p.organization || null,
    phone: p.phone,
    email: p.email,
    context: listName ?? null,
  };
}

/**
 * Birleştir: mevcut kişinin BOŞ alanlarını dosyadan tamamlar, dolu alanlara dokunmaz; notlar eklenir. Telefon ve
 * e-posta yalnız ham olarak gönderilir (normalize değeri sunucu hesaplar).
 */
export function fillEmptyFields(p: Prospect, r: ImportRecord): ProspectPatchInput {
  const patch: ProspectPatchInput = {};
  const keys = ["firstName", "lastName", "organization", "city", "district", "branch"] as const satisfies readonly ProspectTextField[];
  for (const k of keys) if (!p[k] && r[k]) patch[k] = r[k];
  if (!p.phone && r.phone) patch.phoneRaw = r.phoneRaw;
  if (!p.email && r.email) patch.emailRaw = r.emailRaw;
  if (r.note && !p.note.includes(r.note)) patch.note = p.note ? `${p.note} | ${r.note}` : r.note;
  return patch;
}

/** Görevlerim'e (kural "coldList") düşen soğuk kişi: taşınmamış, aranmamış ya da ulaşılamamış. */
export const QUEUE_OUTCOMES: readonly ProspectOutcome[] = ["NOT_CALLED", "UNREACHABLE"];

/** CRM kayıtlarının karşılaştırma biçimindeki telefon / e-posta kümeleri (aday + kurum yetkilisi). */
export function crmContactSets(contacts: readonly { phone?: string | null; email?: string | null }[]): {
  phones: Set<string>;
  emails: Set<string>;
} {
  const phones = new Set<string>();
  const emails = new Set<string>();
  for (const c of contacts) {
    const p = normalizeImportPhone(c.phone);
    if (p) phones.add(p);
    const e = normalizeImportEmail(c.email);
    if (e) emails.add(e);
  }
  return { phones, emails };
}

export type CallableInput = Pick<Prospect, "id" | "phone" | "phoneRaw" | "email" | "outcome" | "crmLeadId" | "movedAt">;

/**
 * Aranacak soğuk kişiler (DeepSport callableProspects). CRM'de aynı telefon / e-posta ile kaydı olanlar (CRM görevi
 * zaten var olabilir), telefonu olmayanlar ve aynı telefonun tekrarları (listeler arası) atlanır. Sıra korunur.
 */
export function callableProspects<P extends CallableInput>(
  prospects: readonly P[],
  crm: { phones: ReadonlySet<string>; emails: ReadonlySet<string> }
): P[] {
  const seenPhones = new Set<string>();
  const out: P[] = [];
  for (const p of prospects) {
    if (p.crmLeadId || isMoved(p) || !QUEUE_OUTCOMES.includes(p.outcome)) continue;
    if (!p.phone && !p.phoneRaw) continue;
    if ((p.phone && crm.phones.has(p.phone)) || (p.email && crm.emails.has(p.email))) continue;
    if (p.phone) {
      if (seenPhones.has(p.phone)) continue;
      seenPhones.add(p.phone);
    }
    out.push(p);
  }
  return out;
}

/** "Sıcağa taşı" notu: program / tür ve kişinin notu (DeepSport "[Soğuk liste] Branş: … · not"). Boşsa null. */
export function convertNoteText(p: Pick<Prospect, "branch" | "note">): string | null {
  const body = [p.branch && `Program / tür: ${p.branch}`, p.note].filter(Boolean).join(" · ");
  return body ? `[Soğuk liste] ${body}` : null;
}

/** Dosya adı için güvenli parça (CSV). */
export function listSlug(name: string): string {
  return (
    name
      .toLocaleLowerCase("tr")
      .replace(/[^a-z0-9ğüşöçı]+/g, "-")
      .replace(/^-+|-+$/g, "") || "liste"
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Detaylı süzgeç (Soğuk listeler ekranı; değerler URL'de, süzme istemcide). Alanlar VE ile birleşir, boş alan süzmez.
// Karşılaştırma Türkçe duyarlı (`lib/utils/filter-match`): "EDİRNE" = "Edirne", ı/i ve aksan farkı yok.
// ---------------------------------------------------------------------------------------------------------------

export interface ProspectDetailFilter {
  /** İl — tam eşleşme (seçenekler listedeki değerlerden). */
  city: string;
  /** İlçe — tam eşleşme. */
  district: string;
  /** Telefon — rakamlar içeriyor mu (E.164 ve ham yazım; baştaki 0 yok sayılır). */
  phone: string;
  /** E-posta — içeriyor mu (normalize ya da ham). */
  email: string;
  /** Kurum adı — içeriyor mu. */
  organization: string;
  /** Ad soyad — "ad soyad" içinde geçiyor mu. */
  name: string;
  /** Program / tür — tam eşleşme. */
  branch: string;
  /** Not — içeriyor mu. */
  note: string;
  hasPhone: PresenceFilter;
  hasEmail: PresenceFilter;
  /** CRM'de kayıtlı: taşınmış (adayı duruyor) ya da aynı telefon / e-postayla CRM adayı ya da kurum kaydı var. */
  inCrm: PresenceFilter;
}

export const PROSPECT_FILTER_KEYS = [
  "city",
  "district",
  "phone",
  "email",
  "organization",
  "name",
  "branch",
  "note",
  "hasPhone",
  "hasEmail",
  "inCrm",
] as const satisfies readonly (keyof ProspectDetailFilter)[];
export type ProspectFilterKey = (typeof PROSPECT_FILTER_KEYS)[number];

export const PRESENCE_FILTER_KEYS = ["hasPhone", "hasEmail", "inCrm"] as const satisfies readonly ProspectFilterKey[];

export const EMPTY_PROSPECT_FILTER: ProspectDetailFilter = {
  city: "",
  district: "",
  phone: "",
  email: "",
  organization: "",
  name: "",
  branch: "",
  note: "",
  hasPhone: "",
  hasEmail: "",
  inCrm: "",
};

/** URL'den gelen var / yok değeri: yalnız "yes" / "no" geçerli, gerisi "hepsi". */
export const toPresenceFilter = (value: string | null | undefined): PresenceFilter =>
  value === "yes" || value === "no" ? value : "";

/** Dolu (etkin) detay süzgeci sayısı. */
export const activeProspectFilterCount = (f: ProspectDetailFilter): number =>
  PROSPECT_FILTER_KEYS.filter((k) => f[k].trim() !== "").length;

export const prospectHasPhone = (p: Pick<Prospect, "phone" | "phoneRaw">): boolean => !!p.phone || p.phoneRaw.trim() !== "";
export const prospectHasEmail = (p: Pick<Prospect, "email" | "emailRaw">): boolean => !!p.email || p.emailRaw.trim() !== "";

/** Telefon gibi görünen arama ("0532 123", "+90 284…"): en az 3 rakam, rakam dışında yalnız boşluk + - ( ). */
const looksLikePhone = (q: string): boolean => /^[\d\s+()-]+$/.test(q) && q.replace(/\D/g, "").length >= 3;

/**
 * Serbest arama (?q=): ad, soyad, kurum, telefon, e-posta, il, ilçe, program / tür içinde geçiyor mu. Telefon gibi
 * görünen arama yazım farkından bağımsız eşleşir ("0532 123" → "+90532123…" ve "0532-123…").
 */
export function prospectMatchesQuery(p: Prospect, q: string): boolean {
  const query = q.trim();
  if (!query) return true;
  if (looksLikePhone(query) && phoneMatches(query, p.phone, p.phoneRaw)) return true;
  return [p.firstName, p.lastName, p.organization, p.phoneRaw, p.phone, p.email, p.emailRaw, p.city, p.district, p.branch].some((v) =>
    textIncludes(v, query)
  );
}

export interface ProspectFilterOptions {
  /** Serbest arama (?q=). */
  q?: string;
  /** CRM eşleşmesi (aday / kurum yetkilisi telefon / e-posta dizini ekranın kancasında durur). */
  hasCrmMatch?: (p: Prospect) => boolean;
}

/** Kişi detay süzgecine (ve serbest aramaya) uyuyor mu — alanlar VE ile. */
export function prospectMatchesFilter(p: Prospect, f: ProspectDetailFilter, opts: ProspectFilterOptions = {}): boolean {
  return (
    sameText(p.city, f.city) &&
    sameText(p.district, f.district) &&
    phoneMatches(f.phone, p.phone, p.phoneRaw) &&
    (textIncludes(p.email, f.email) || textIncludes(p.emailRaw, f.email)) &&
    textIncludes(p.organization, f.organization) &&
    textIncludes(prospectName(p), f.name) &&
    sameText(p.branch, f.branch) &&
    textIncludes(p.note, f.note) &&
    presenceMatches(prospectHasPhone(p), f.hasPhone) &&
    presenceMatches(prospectHasEmail(p), f.hasEmail) &&
    (f.inCrm === "" || presenceMatches(p.crmLeadId != null || !!opts.hasCrmMatch?.(p), f.inCrm)) &&
    prospectMatchesQuery(p, opts.q ?? "")
  );
}

/** Detay süzgeci + serbest arama (sonuç sekmesi ayrı uygulanır; sekme sayıları bu sonuçtan sayılır). Sıra korunur. */
export function filterProspects<P extends Prospect>(prospects: readonly P[], f: ProspectDetailFilter, opts: ProspectFilterOptions = {}): P[] {
  if (activeProspectFilterCount(f) === 0 && !(opts.q ?? "").trim()) return [...prospects];
  return prospects.filter((p) => prospectMatchesFilter(p, f, opts));
}
