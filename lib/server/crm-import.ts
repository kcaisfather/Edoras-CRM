import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { dbError, type StaffContext } from "@/lib/api/server";
import {
  contactSets,
  screenImportItems,
  toLeadColumns,
  type BulkImportResult,
  type ContactSets,
  type ImportItemValues,
  type SkippedRow,
} from "@/lib/import/bulk";
import { recordAudit } from "./audit";
import { fetchAll } from "./edoras";

/**
 * İçe aktarmanın sunucu tarafı (Madde 13 + EK-1): mükerrer karşılaştırma kümeleri ve CRM adayı toplu ekleme
 * (POST /api/crm/leads/bulk). İstemcinin önizlemesine ve mükerrer işaretlerine güvenilmez: telefon / e-posta ham
 * metinden yeniden normalleştirilir, karşılaştırma bu modülün okuduğu verilerle yapılır (lib/import/bulk.ts).
 *
 * İşlem kaydına yalnız SAYILAR yazılır (kaç eklendi, kaçı hangi nedenle atlandı); ad, telefon, e-posta yazılmaz.
 */

export interface ContactIndex {
  /** CRM adaylarının telefon / e-postası. */
  crm: ContactSets;
  /** Kurum yetkilileri (crm_institutions: demo ve ücretli kurumların iletişim kişisi). */
  institutions: ContactSets;
}

/** Mükerrer karşılaştırması için CRM adayları ve kurum yetkilileri (yalnız telefon ve e-posta okunur). */
export async function loadContactIndex(): Promise<ContactIndex> {
  const db = getSupabaseAdminClient();
  const [leads, institutions] = await Promise.all([
    fetchAll<{ contact_phone: string | null; contact_email: string | null }>((a, b) =>
      db
        .from("crm_leads")
        .select("contact_phone, contact_email")
        .or("contact_phone.not.is.null,contact_email.not.is.null")
        .order("id")
        .range(a, b)
    ),
    fetchAll<{ contact_phone: string; contact_email: string }>((a, b) =>
      db.from("crm_institutions").select("contact_phone, contact_email").order("institution_id").range(a, b)
    ),
  ]);
  return {
    crm: contactSets(leads.map((l) => ({ phone: l.contact_phone, email: l.contact_email }))),
    institutions: contactSets(institutions.map((i) => ({ phone: i.contact_phone, email: i.contact_email }))),
  };
}

/** Atlanan satırların nedene göre sayısı (işlem kaydı; kişisel veri yok). */
export function skipCounts(skipped: readonly SkippedRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of skipped) out[`skipped_${s.reason}`] = (out[`skipped_${s.reason}`] ?? 0) + 1;
  return out;
}

/**
 * CRM adayı toplu içe aktarma: her geçerli satır için "Aranacak" statülü aday (kaynak IMPORT) tek ifadede eklenir.
 * Tutar alanları yazılmaz. `dryRun` aynı raporu yazmadan döner. Eşzamanlı iki içe aktarma aynı telefonu ikisi de
 * yeni görebilir (adaylarda benzersiz kısıt yok — mükerrer aday meşru olabilir); CRM'deki "Olası mükerrer"
 * görünümü bunları gösterir.
 */
export async function importLeads(items: readonly ImportItemValues[], dryRun: boolean, staff: StaffContext): Promise<BulkImportResult> {
  const index = await loadContactIndex();
  const { accepted, skipped } = screenImportItems(items, { target: "crm", ...index });
  if (dryRun || accepted.length === 0) {
    if (!dryRun) await auditLeadsImported(staff, 0, skipped);
    return { created: dryRun ? accepted.length : 0, skipped, dryRun };
  }
  const { error } = await getSupabaseAdminClient()
    .from("crm_leads")
    .insert(accepted.map((n) => toLeadColumns(n, staff.userId)));
  if (error) throw dbError(error);
  await auditLeadsImported(staff, accepted.length, skipped);
  return { created: accepted.length, skipped, dryRun: false };
}

async function auditLeadsImported(staff: StaffContext, created: number, skipped: readonly SkippedRow[]) {
  await recordAudit(staff, {
    action: "LEADS_IMPORTED",
    entityType: "lead",
    details: { created, skipped: skipped.length, ...skipCounts(skipped) },
  });
}
