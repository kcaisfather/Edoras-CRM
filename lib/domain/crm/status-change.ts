/**
 * Satır içi statü değişikliği (Adaylar listesi "Satış aşaması" rozeti ve aday panelinin statü seçicisi) — DeepSport
 * features/crm/useLeadStatusUpdate.ts'in saf parçaları. Yazım yolu düzenleme formuyla AYNI uçtur
 * (PATCH /api/crm/leads/{id}, kısmi): statü kuralları (sonraki arama yalnız takip statülerinde, kayıp nedeni ve
 * ayrıntısı yalnız "Satış olmadı"da, satış tarihi, teklifi veren / satışı yapan) sunucuda uygulanır; burası yalnız
 * gövdeyi kurar, iyimser önbellek yamasını hesaplar ve "Geri al" gövdesini üretir. Saf fonksiyonlar — testli.
 */
import { followUpSuggestDays, type RuleConfig } from "@/lib/domain/tasks/rules";
import { parseAmount } from "@/lib/utils/money";
import { planLossDetail } from "./loss-detail";
import { FOLLOW_UP_STATUSES, addDaysIso, applyStatusChange } from "./offer";
import type { LeadPatchInput } from "./schemas";
import { isLostReason, type CrmLead, type CrmLeadDto, type CrmStatus } from "./types";
import { amountForSave } from "./utils";

/** Ek bilgi isteyen statüler (rozetin yanında küçük pencere açılır); diğerleri seçilince hemen kaydedilir. */
export const CONTEXT_STATUSES: readonly CrmStatus[] = ["TEKLIF_VERILDI", "OLUMSUZ", "SATIS_OLDU"];

export function statusNeedsContext(status: CrmStatus): boolean {
  return CONTEXT_STATUSES.includes(status);
}

/**
 * Pencere açılırken sonraki arama tarihi: kayıttaki tarih varsa o (düzenleme formu da mevcut tarihi korur), yoksa
 * takip kuralı önerisi — teklif → "offer", satış olmadı → "lostRecontact" (formdaki öneriyle aynı; kural kapalıysa yok).
 */
export function suggestedNextDate(status: CrmStatus, currentNext: string | null, rules: RuleConfig[], today: Date = new Date()): string {
  if (currentNext) return currentNext;
  const days = followUpSuggestDays(rules)[status];
  return days != null ? addDaysIso(today, days) : "";
}

export interface StatusChangeInput {
  /** YYYY-MM-DD ya da "" (boş → mevcut tarih korunur). */
  nextCall?: string;
  lostReason?: string;
  /** Tutar alanları, Türkçe yazımla (yalnız finans yetkisiyle gösterilir ve gönderilir). */
  offerAmount?: string;
  saleAmount?: string;
}

export type StatusChangeError = "lostReasonRequired" | "amountInvalid";

export type StatusChangeResult = { ok: true; patch: LeadPatchInput } | { ok: false; error: StatusChangeError };

/**
 * Statü değişikliğinin PATCH gövdesi (düzenleme formunun formToPatch kurallarıyla aynı):
 * - "Satış olmadı"da kayıp nedeni zorunlu (satır içi pencerenin kuralı); ayrıntı (not, rakip, yeniden temas) gövdede
 *   YOKTUR: sunucu kayıttakini korur, neden değişince rakip adını ve çıkışta üçünü de temizler;
 * - sonraki arama yalnız takip statülerinde ve girildiyse gönderilir (boş = mevcut tarih korunur);
 * - tutar yalnız finans yetkisiyle: Teklif verildi → teklif, Satış oldu → satış; boş alan 0 TL (EK-2), okunamayan tutar hata.
 * Teklifi veren / satışı yapan gövdede yoktur: sunucu oturumdan yazar.
 */
export function buildStatusChange({
  lead,
  target,
  input = {},
  canSeeFinancials,
}: {
  lead: CrmLead;
  target: CrmStatus;
  input?: StatusChangeInput;
  canSeeFinancials: boolean;
}): StatusChangeResult {
  const patch: LeadPatchInput = { status: target };

  if (target === "OLUMSUZ") {
    const reason = input.lostReason ?? lead.lostReason ?? "";
    if (!isLostReason(reason)) return { ok: false, error: "lostReasonRequired" };
    patch.lostReason = reason;
  }
  if (FOLLOW_UP_STATUSES.includes(target) && input.nextCall) patch.nextFollowUpAt = input.nextCall;

  if (canSeeFinancials && (target === "TEKLIF_VERILDI" || target === "SATIS_OLDU")) {
    const offer = target === "TEKLIF_VERILDI";
    const text = (offer ? input.offerAmount : input.saleAmount) ?? "";
    if (text.trim() && parseAmount(text) === null) return { ok: false, error: "amountInvalid" };
    const value = amountForSave(text, offer ? lead.offerAmount : lead.saleAmount, true);
    if (value !== undefined) {
      if (offer) patch.offerAmount = value;
      else patch.saleAmount = value;
    }
  }
  return { ok: true, patch };
}

/**
 * "Geri al" gövdesi: önceki statü + sunucunun statü geçişinde değiştirdiği alanların eski değerleri (sonraki arama,
 * kayıp nedeni ve ayrıntısı; ileri yazım tutar değiştirdiyse eski tutar, yoksa açık null). Önceki statü yoksa null.
 */
export function buildUndoPatch(prev: CrmLead, forward: LeadPatchInput, canSeeFinancials: boolean): LeadPatchInput | null {
  if (!prev.status) return null;
  const undo: LeadPatchInput = { status: prev.status };
  if (FOLLOW_UP_STATUSES.includes(prev.status)) undo.nextFollowUpAt = prev.nextFollowUpAt ?? null;
  if (prev.status === "OLUMSUZ") {
    undo.lostReason = isLostReason(prev.lostReason) ? prev.lostReason : null;
    undo.lostNote = prev.lostNote ?? null;
    undo.competitor = prev.competitor ?? null;
    undo.recallAt = prev.recallAt ?? null;
  }
  if (canSeeFinancials) {
    if (forward.offerAmount !== undefined) undo.offerAmount = prev.offerAmount ?? null;
    if (forward.saleAmount !== undefined) undo.saleAmount = prev.saleAmount ?? null;
  }
  return undo;
}

/**
 * Önbelleğe iyimser uygulanacak alanlar (sunucunun applyStatusChange + planLossDetail sonucu); yazım bitince
 * liste yine sunucudan tazelenir. `today` YYYY-MM-DD.
 */
export function optimisticLeadFields(lead: CrmLead, patch: LeadPatchInput, today: string): Partial<CrmLeadDto> {
  const status = patch.status ?? lead.status ?? "ARANACAK";
  const cols = applyStatusChange(
    { status: lead.status },
    {
      status,
      nextDate: patch.nextFollowUpAt !== undefined ? patch.nextFollowUpAt : (lead.nextFollowUpAt ?? null),
      lostReason: patch.lostReason !== undefined ? patch.lostReason : (lead.lostReason ?? null),
    },
    today
  );
  const loss = planLossDetail(
    { lost_note: lead.lostNote ?? null, competitor: lead.competitor ?? null, recall_at: lead.recallAt ?? null },
    patch,
    status,
    cols.lost_reason
  );
  const out: Partial<CrmLeadDto> = {
    status,
    nextFollowUpAt: cols.next_follow_up_at,
    lostReason: cols.lost_reason,
    soldAt: cols.sold_at === undefined ? (lead.soldAt ?? null) : cols.sold_at,
  };
  if (cols.offer_sent_at) out.offerSentAt = cols.offer_sent_at;
  if ("lost_note" in loss) out.lostNote = loss.lost_note ?? null;
  if ("competitor" in loss) out.competitor = loss.competitor ?? null;
  if ("recall_at" in loss) out.recallAt = loss.recall_at ?? null;
  if (patch.offerAmount !== undefined) out.offerAmount = patch.offerAmount;
  if (patch.saleAmount !== undefined) out.saleAmount = patch.saleAmount;
  return out;
}

/** Alanları kayda uygular; değişiklik yoksa aynı nesne döner. */
export function applyFieldsToLead<T extends { id: string }>(lead: T, fields: Partial<CrmLeadDto>): T {
  let changed = false;
  const next: Record<string, unknown> = { ...lead };
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (next[key] !== value) {
      next[key] = value;
      changed = true;
    }
  }
  return changed ? (next as T) : lead;
}

const isLeadLike = (value: unknown): value is { id: string } =>
  typeof value === "object" && value !== null && typeof (value as { id?: unknown }).id === "string";

/**
 * Aday önbelleğindeki bir sorgu verisinde adayı günceller: dizi (aday listesi) ya da tek kayıt (kurumun adayı).
 * Tanınmayan şekil (kurallar, tahsilatlar, görevler…) aynen döner.
 */
export function patchLeadInCache<D>(data: D, leadId: string, update: (lead: { id: string }) => { id: string }): D {
  if (Array.isArray(data)) {
    let changed = false;
    const out = data.map((item) => {
      if (!isLeadLike(item) || item.id !== leadId) return item;
      const next = update(item);
      if (next !== item) changed = true;
      return next;
    });
    return (changed ? out : data) as D;
  }
  if (isLeadLike(data) && data.id === leadId) return update(data) as D;
  return data;
}
