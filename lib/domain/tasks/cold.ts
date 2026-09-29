/**
 * Kural "coldList" — "Soğuk liste araması" (DeepSport features/tasks/derive.ts → kural 10). Saf fonksiyonlar.
 *
 * - Aranmadı (NOT_CALLED): bugün aranır. Ulaşılamadı (UNREACHABLE): son denemeden (outcome_at, Türkiye günü) N gün
 *   sonra yeniden. Görüşüldü / İlgilenmiyor / CRM'e taşınmış kişi görev üretmez (DeepSport ile aynı).
 * - CRM'de aynı telefon / e-posta ile adayı ya da kurum yetkilisi olan kişi, telefonu olmayan kişi ve listeler arası
 *   aynı telefonun tekrarı atlanır (callableProspects).
 * - crm_tasks'a satır YAZILMAZ: görevi kapatmak = kişinin arama sonucunu girmek (PATCH /api/crm/prospects/{id}).
 *   Sonuç değişince görev düşer (Görüşüldü / İlgilenmiyor) ya da vadesi ileri kayar (Ulaşılamadı → yeni an + N gün).
 *   Kural görevlerinin tamamlama ucu (POST /api/crm/tasks/complete) bu görevleri kabul etmez.
 * - SINIR (DeepSport'ta yoktu): binlerce satırlık bir içe aktarma Görevlerim'i boğmasın diye aynı anda en çok
 *   COLD_LIST_NEW_TASK_CAP aranmamış kişi görev olur — listelerin ekleme sırasıyla (eski liste, dosya sırası önce).
 *   Sonuç girildikçe sıradakiler gelir. Ulaşılamayanların yeniden aramaları sınırlanmaz (sayıları yapılan aramayla
 *   sınırlıdır). DeepSport'taki gibi menü rozeti soğuk liste görevlerini saymaz.
 * - Görünürlük: ekip havuzu (kural görevi; kimseye atanmaz).
 */
import { addDays, todayIso } from "@/lib/domain/institutions/rules";
import { callableProspects } from "@/lib/domain/cold-lists/utils";
import type { ProspectOutcome } from "@/lib/domain/cold-lists/types";
import { ruleMap, type RuleConfig } from "./rules";
import { taskKey } from "./derive";
import type { CrmTaskDto, TaskProspectDto } from "./types";

/** Aynı anda Görevlerim'de görünen en çok "aranmamış" soğuk liste kişisi. */
export const COLD_LIST_NEW_TASK_CAP = 50;
/** Sunucunun aday olarak taradığı en çok aranmamış kişi (ekleme sırasıyla; sınırın birkaç katı yeter). */
export const COLD_LIST_SCAN_LIMIT = 1000;

/** Türetmenin girdisi: taşınmamış, aranmamış / ulaşılamamış kişiler — EKLEME SIRASIYLA (seq). */
export interface TaskProspectInput {
  id: string;
  listId: string;
  listName: string | null;
  outcome: ProspectOutcome;
  outcomeAt: number | null;
  crmLeadId: string | null;
  movedAt: number | null;
  firstName: string;
  lastName: string;
  organization: string;
  phoneRaw: string;
  phone: string | null;
  email: string | null;
}

function toProspectDto(p: TaskProspectInput): TaskProspectDto {
  return {
    id: p.id,
    listId: p.listId,
    listName: p.listName,
    outcome: p.outcome,
    firstName: p.firstName,
    lastName: p.lastName,
    organization: p.organization,
    phone: p.phone,
    phoneRaw: p.phoneRaw,
    email: p.email,
  };
}

/**
 * Açık soğuk liste görevleri (anahtar `coldList:${kişi}:${vade}`; aranmamış kişide vade bugün olduğu için anahtar
 * her gün değişir — saklanmadığından sorun değildir). Sıra: vade, sonra ekleme sırası.
 */
export function deriveColdListTasks(
  prospects: readonly TaskProspectInput[],
  crm: { phones: ReadonlySet<string>; emails: ReadonlySet<string> },
  rules: RuleConfig[],
  today: string,
  cap = COLD_LIST_NEW_TASK_CAP
): CrmTaskDto[] {
  const rule = ruleMap(rules).coldList;
  if (!rule.enabled) return [];
  const out: { task: CrmTaskDto; order: number }[] = [];
  let fresh = 0;
  callableProspects(prospects, crm).forEach((p, order) => {
    const base = p.outcome === "UNREACHABLE" && p.outcomeAt != null ? todayIso(new Date(p.outcomeAt)) : null;
    if (!base) {
      if (fresh >= cap) return;
      fresh++;
    }
    const dueDate = base ? addDays(base, rule.days) : today;
    const key = taskKey("coldList", p.id, dueDate);
    out.push({
      order,
      task: {
        id: key,
        taskId: null,
        key,
        kind: "coldList",
        leadId: null,
        institutionId: null,
        dueDate,
        refDate: base,
        status: "OPEN",
        assigneeId: null,
        assigneeName: null,
        type: null,
        note: null,
        outcome: null,
        resultNote: null,
        completedAt: null,
        completedBy: null,
        completedByName: null,
        createdBy: null,
        createdByName: null,
        prospect: toProspectDto(p),
      },
    });
  });
  return out.sort((a, b) => a.task.dueDate.localeCompare(b.task.dueDate) || a.order - b.order).map((x) => x.task);
}
