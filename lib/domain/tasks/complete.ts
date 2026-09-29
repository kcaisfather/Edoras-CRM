/**
 * Görev tamamlama — adaya yazılacak statü kolonları (saf; DeepSport features/tasks/complete.ts
 * `planTaskCompletion`'ın CRM_OFFER_FIELDS açık yolu). Not önekleri (`[GOREV|…]`, `[ATAMA|…|done]`,
 * `[TEKLIF|…]`, `[TAKIP|…]`) yok: görev crm_tasks'ta, sonuç notu düz metin olarak crm_notes'ta, takip
 * bilgisi crm_leads kolonlarında. Yazım crm_complete_task'ta tek transaction'dır.
 */

import { applyStatusChange, type StatusColumns } from "@/lib/domain/crm/offer";
import type { CrmStatus, LostReason } from "@/lib/domain/crm/types";

export interface CompletionLeadInput {
  /** Yeni statü; verilmezse ya da mevcutla aynıysa statü değişmez. */
  status?: CrmStatus | null;
  /** Sonraki arama günü (YYYY-MM-DD). */
  nextFollowUpAt?: string | null;
  lostReason?: LostReason | null;
}

export interface CurrentLeadStatus {
  status: CrmStatus;
  next_follow_up_at: string | null;
}

/**
 * Adaya yazılacak kolonlar (değişiklik yoksa null):
 * - statü değişirse `applyStatusChange` kuralları (sonraki arama yalnız takip statülerinde, kayıp nedeni yalnız
 *   "Satış olmadı"da, teklif / satış tarihi geçişte bugün);
 * - sonraki arama günü girildiyse ve statü yazımı onu zaten koymadıysa her statüde yazılır ("Girilirse bu tarihte
 *   yeni bir görev oluşur" — DeepSport ile aynı).
 */
export function planLeadPatch(
  current: CurrentLeadStatus,
  input: CompletionLeadInput,
  today: string
): Partial<StatusColumns> | null {
  const out: Partial<StatusColumns> = {};
  if (input.status && input.status !== current.status) {
    Object.assign(
      out,
      applyStatusChange(
        { status: current.status },
        { status: input.status, nextDate: input.nextFollowUpAt ?? null, lostReason: input.lostReason ?? null },
        today
      )
    );
  }
  const dateWritten = out.next_follow_up_at != null;
  if (input.nextFollowUpAt && !dateWritten && input.nextFollowUpAt !== current.next_follow_up_at) {
    out.next_follow_up_at = input.nextFollowUpAt;
  }
  return Object.keys(out).length ? out : null;
}
