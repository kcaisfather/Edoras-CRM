/** Mükerrer önizlemesi için mevcut kayıtları ortak biçime çevirir (DeepSport lib/import/existing.ts). */
import type { CrmLead } from "@/lib/domain/crm/types";
import type { InstitutionListItem } from "@/lib/domain/institutions/types";
import type { ExistingContact } from "./duplicates";
import { normalizeImportEmail, normalizeImportPhone } from "./normalize";

export function crmLeadToExisting(l: CrmLead): ExistingContact {
  const name = [l.contactFirstName, l.contactLastName].filter(Boolean).join(" ");
  return {
    source: "crm",
    id: l.id,
    name: name || l.organizationName || l.contactEmail || "-",
    organization: l.organizationName ?? null,
    phone: normalizeImportPhone(l.contactPhone),
    email: normalizeImportEmail(l.contactEmail),
    context: l.status ?? null,
  };
}

/**
 * Edoras kurumunun CRM kaydındaki yetkili (DeepSport'taki "kayıtlı kullanıcı" karşılığı: müşteri / demo kurum).
 * CRM kaydı olmayan kurumun yetkilisi bilinmez → null.
 */
export function institutionToExisting(i: InstitutionListItem): ExistingContact | null {
  if (!i.crm) return null;
  return {
    source: "institution",
    id: i.id,
    name: i.crm.contactName || i.name,
    organization: i.name,
    phone: normalizeImportPhone(i.crm.contactPhone),
    email: normalizeImportEmail(i.crm.contactEmail),
    context: i.crm.status,
  };
}
