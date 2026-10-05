/**
 * Kayıp ayrıntısı ("Satış olmadı" / OLUMSUZ) — DeepSport lib/domain/crm/loss-detail.ts'in sunucu tarafı karşılığı.
 * Kayıp notu, rakip adı (yalnız neden "Rakip tercih edildi" = COMPETITOR iken) ve yeniden temas günü crm_leads
 * kolonlarındadır (lost_note, competitor, recall_at). Üçü de yalnız statü OLUMSUZ iken dolu olabilir
 * (SQL: crm_leads_loss_detail_check, crm_leads_competitor_check); "Satış olmadı"dan çıkınca temizlenir.
 * Saf fonksiyonlar — testler loss-detail.test.ts'te.
 */
import type { CrmStatus } from "./types";

export const COMPETITOR_NAME_MAX = 128;
export const LOST_NOTE_MAX = 2000;

/** crm_leads kayıp ayrıntısı kolonları. */
export interface LossDetailColumns {
  lost_note: string | null;
  competitor: string | null;
  recall_at: string | null;
}

/** "Satış olmadı"dan çıkarken / hiç girilmemişken yazılan değerler. */
export const LOSS_DETAIL_CLEARED: LossDetailColumns = { lost_note: null, competitor: null, recall_at: null };

/** Gövdeden gelen ayrıntı; `undefined` = dokunma, `null` = temizle. */
export interface LossDetailInput {
  lostNote?: string | null;
  competitor?: string | null;
  recallAt?: string | null;
}

/**
 * Yazılacak kayıp ayrıntısı kolonları (yalnız DEĞİŞENler; değişiklik yoksa boş nesne).
 * - Son statü OLUMSUZ değilse üçü de null olur (çıkışta temizlik; gövdedeki değer yok sayılır).
 * - Rakip adı yalnız son neden COMPETITOR iken kalır; neden başka bir şeye çevrildiyse temizlenir.
 */
export function planLossDetail(
  current: LossDetailColumns,
  input: LossDetailInput,
  finalStatus: CrmStatus,
  finalReason: string | null
): Partial<LossDetailColumns> {
  const next: LossDetailColumns =
    finalStatus !== "OLUMSUZ"
      ? LOSS_DETAIL_CLEARED
      : {
          lost_note: input.lostNote !== undefined ? input.lostNote : current.lost_note,
          competitor:
            finalReason === "COMPETITOR" ? (input.competitor !== undefined ? input.competitor : current.competitor) : null,
          recall_at: input.recallAt !== undefined ? input.recallAt : current.recall_at,
        };
  const out: Partial<LossDetailColumns> = {};
  for (const key of Object.keys(next) as (keyof LossDetailColumns)[]) {
    if (next[key] !== current[key]) out[key] = next[key];
  }
  return out;
}
