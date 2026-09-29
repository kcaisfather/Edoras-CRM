/**
 * Soğuk liste saf yardımcıları (DeepSport lib/domain/cold-lists/utils.ts + store.ts'in saf geçişleri): görünen ad,
 * mükerrer karşılaştırma biçimi, birleştirme, Görevlerim'e düşen kişiler, "Sıcağa taşı" notu.
 */
import type { ExistingContact } from "@/lib/import/duplicates";
import { normalizeImportEmail, normalizeImportPhone } from "@/lib/import/normalize";
import type { ImportRecord } from "@/lib/import/records";
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
