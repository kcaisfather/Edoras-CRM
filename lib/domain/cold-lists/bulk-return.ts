/**
 * Toplu "Soğuk listeye taşı" (Adaylar toplu işlem çubuğu → POST /api/crm/leads/cold-list) — saf parçalar: sunucunun
 * aday başına döngüsü, istemcinin parça sonuçlarını birleştirmesi ve atlananların nedene göre sayımı. Aday başına iş
 * tekil "Soğuk listeye taşı" ile AYNI yoldur (lib/server/crm-prospects.ts → returnLeadToColdList); burada yalnız sıra,
 * tekilleştirme ve sonuç toplanır.
 */

/** Toplu uçta istek başına en çok aday (şema da uygular). */
export const LEADS_TO_COLD_LIST_MAX = 200;

/** İstemci seçimi bu boyutta parçalara bölüp SIRAYLA gönderir: her istek kısa sürer, ilerleme gösterilir. */
export const LEADS_TO_COLD_LIST_CHUNK = 25;

export interface LeadsToColdListSkip {
  id: string;
  /** Hata kodu (lib/api/error-codes.ts): LEAD_IS_CUSTOMER, PROSPECT_DUPLICATE, NOT_FOUND, … */
  code: string;
}

export interface LeadsToColdListResult {
  /** Soğuk listeye taşınan aday sayısı. */
  moved: number;
  /** Bunlardan listede zaten duran satırı geri açılanlar ("CRM'e taşındı" işareti kaldırıldı). */
  restored: number;
  /** Atlanan adaylar ve nedeni; kalanlar yine taşınır. */
  skipped: LeadsToColdListSkip[];
}

export const emptyLeadsToColdListResult = (): LeadsToColdListResult => ({ moved: 0, restored: 0, skipped: [] });

/**
 * Adayları SIRAYLA işler (aynı listeye eşzamanlı yazım kendi mükerrer kontrolünü atlatmasın); hata veren aday atlanır
 * (kodu `codeOf` verir), kalanlar sürer. Aynı kimlik bir kez işlenir.
 */
export async function returnLeadsInTurn(
  leadIds: readonly string[],
  returnOne: (leadId: string) => Promise<{ restored: boolean }>,
  codeOf: (error: unknown) => string
): Promise<LeadsToColdListResult> {
  const result = emptyLeadsToColdListResult();
  for (const id of new Set(leadIds)) {
    try {
      const { restored } = await returnOne(id);
      result.moved += 1;
      if (restored) result.restored += 1;
    } catch (error) {
      result.skipped.push({ id, code: codeOf(error) });
    }
  }
  return result;
}

/** İki parçanın sonucunu toplar (istemci parçaları sırayla gönderir). */
export function mergeLeadsToColdListResults(a: LeadsToColdListResult, b: LeadsToColdListResult): LeadsToColdListResult {
  return { moved: a.moved + b.moved, restored: a.restored + b.restored, skipped: [...a.skipped, ...b.skipped] };
}

/** Atlanma nedenleri (toast açıklaması); bilinmeyen kodlar OTHER'da toplanır. */
export const LEADS_TO_COLD_LIST_SKIP_REASONS = ["LEAD_IS_CUSTOMER", "PROSPECT_DUPLICATE", "NOT_FOUND", "OTHER"] as const;
export type LeadsToColdListSkipReason = (typeof LEADS_TO_COLD_LIST_SKIP_REASONS)[number];

/** Atlananların nedene göre sayısı — sabit sırayla, yalnız sayısı olanlar. */
export function countSkipReasons(skipped: readonly LeadsToColdListSkip[]): { reason: LeadsToColdListSkipReason; count: number }[] {
  const counts = new Map<LeadsToColdListSkipReason, number>();
  for (const { code } of skipped) {
    const reason = (LEADS_TO_COLD_LIST_SKIP_REASONS as readonly string[]).includes(code) ? (code as LeadsToColdListSkipReason) : "OTHER";
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return LEADS_TO_COLD_LIST_SKIP_REASONS.filter((r) => counts.has(r)).map((reason) => ({ reason, count: counts.get(reason) ?? 0 }));
}
