/**
 * Görevlerim ekranı: sunucu satırı + adayı / kurumu (istemci önbelleğindeki listelerden) + vadeye kalan gün.
 * DeepSport'ta sunucu yolu da görevi yüklü lead listesiyle birleştiriyordu; burada kurum görevleri için
 * kurum listesi de kullanılır. Saf fonksiyonlar.
 */
import { daysBetween } from "@/lib/domain/institutions/rules";
import type { CrmLead } from "@/lib/domain/crm/types";
import type { InstitutionListItem } from "@/lib/domain/institutions/types";
import type { CrmTaskDto } from "./types";

export interface CrmTask extends CrmTaskDto {
  /** Görevin adayı (kurum görevinde kurumun bağlı adayı); yoksa null. */
  lead: CrmLead | null;
  /** Kurum görevinin kurumu ya da adayın bağlı kurumu (liste yüklüyse). */
  institution: InstitutionListItem | null;
  /** Vadeye kalan gün (geçmişse negatif). */
  dueInDays: number;
}

/**
 * Satırları aday / kurum nesneleriyle birleştirir. Ne adayı ne kurumu bulunabilen satır (liste henüz
 * yüklenmedi ya da kayıt az önce silindi) atlanır — DeepSport'taki gibi.
 */
export function attachTaskSubjects(
  dtos: readonly CrmTaskDto[],
  leads: readonly CrmLead[],
  institutions: readonly InstitutionListItem[] | undefined,
  today: string
): CrmTask[] {
  const leadById = new Map(leads.map((l) => [l.id, l]));
  const instById = new Map((institutions ?? []).map((i) => [i.id, i]));
  const out: CrmTask[] = [];
  for (const d of dtos) {
    const lead = d.leadId ? (leadById.get(d.leadId) ?? null) : null;
    const instId = d.institutionId ?? lead?.institutionId ?? null;
    const institution = lead?.institution ?? (instId ? (instById.get(instId) ?? null) : null);
    if (!lead && !(d.institutionId && institution)) continue;
    out.push({ ...d, lead, institution, dueInDays: daysBetween(today, d.dueDate) });
  }
  return out;
}

/** Arama kutusu: kurum, kişi, e-posta, telefon (aday) ya da kurum adı ve yetkilisi (kurum görevi). */
export function taskMatches(task: Pick<CrmTask, "lead" | "institution">, q: string): boolean {
  const needle = q.trim().toLocaleLowerCase("tr");
  if (!needle) return true;
  const l = task.lead;
  const i = task.institution;
  const hay = [
    l?.organizationName,
    l?.contactFirstName,
    l?.contactLastName,
    l?.contactEmail,
    l?.contactPhone,
    i?.name,
    i?.crm?.contactName,
    i?.crm?.contactPhone,
    i?.crm?.contactEmail,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("tr");
  return hay.includes(needle);
}
