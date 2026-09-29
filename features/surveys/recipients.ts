import { APP_URL } from "@/lib/env";
import type { CrmLead } from "@/lib/domain/crm/types";
import { getContactName } from "@/lib/domain/crm/utils";
import type { InstitutionListItem } from "@/lib/domain/institutions/types";
import type { SurveyRecipientInput } from "@/lib/domain/surveys/types";

/**
 * Anket linklerinin kökü (tarayıcı): NEXT_PUBLIC_APP_URL, yoksa panelin açık olduğu adres. Sunucu e-postada aynı kuralı
 * uygular (lib/server/app-url.ts).
 */
export function appOrigin(): string {
  if (APP_URL) return APP_URL;
  return typeof window === "undefined" ? "" : window.location.origin;
}

export type PickerRecipient = SurveyRecipientInput & { key: string; kind: "lead" | "institution" };

/**
 * Adaydan alıcı (sunucu da aynı sırayla çözer: önce adayın iletişimi, eksikse bağlı kurumun yetkilisi). Sunucuya
 * yalnız kimlikler gider; ad / e-posta / telefon burada yalnız ekran ve kanal uygunluğu içindir.
 */
export function leadRecipient(lead: CrmLead): PickerRecipient {
  const inst = lead.institution?.crm ?? null;
  return {
    key: `l:${lead.id}`,
    kind: "lead",
    leadId: lead.id,
    institutionId: lead.institutionId,
    name: getContactName(lead) || inst?.contactName || null,
    organizationName: lead.organizationName ?? lead.institution?.name ?? null,
    email: lead.contactEmail ?? inst?.contactEmail ?? null,
    phone: lead.contactPhone ?? inst?.contactPhone ?? null,
  };
}

/** Adayı olmayan (CRM kaydı olan, iç olmayan) kurumdan alıcı: kurum yetkilisi. */
export function institutionRecipient(inst: InstitutionListItem): PickerRecipient | null {
  if (!inst.crm || inst.isInternal) return null;
  return {
    key: `i:${inst.id}`,
    kind: "institution",
    leadId: null,
    institutionId: inst.id,
    name: inst.crm.contactName,
    organizationName: inst.name,
    email: inst.crm.contactEmail,
    phone: inst.crm.contactPhone,
  };
}

/** Gönderim listesi: tüm adaylar + adayı olmayan kurumlar (DeepSport'ta yalnız CRM lead'leriydi). */
export function pickerRecipients(leads: readonly CrmLead[], institutions: readonly InstitutionListItem[] | undefined): PickerRecipient[] {
  const linked = new Set(leads.map((l) => l.institutionId).filter(Boolean));
  const fromInstitutions = (institutions ?? [])
    .filter((i) => !linked.has(i.id))
    .map(institutionRecipient)
    .filter((r): r is PickerRecipient => r != null);
  return [...leads.map(leadRecipient), ...fromInstitutions];
}
