/**
 * Havuz ön incelemesi (saf). Gece işi (`edoras-soru-havuzu`, Haiku) her bekleyen soru/deste için bir karar önerir; CRM bunu
 * satıra yazar (rozet) ve yalnız ortam bayrakları AÇIKSA kendisi de karar verir. Varsayılan: hiçbir otomatik karar yok.
 */
import { z } from "zod";

export const AI_VERDICTS = ["ONAY", "RED", "BELIRSIZ"] as const;
export type AiVerdict = (typeof AI_VERDICTS)[number];

export const aiReviewItemSchema = z.object({
  id: z.string().uuid(),
  verdict: z.enum(AI_VERDICTS),
  confidence: z.number().min(0).max(1),
  reason: z
    .string()
    .trim()
    .max(500)
    .nullish()
    .transform((v) => (v ? v : null)),
});

/** Gece işinin bir partisi: en çok 200 sonuç, tek model adı. */
export const aiReviewBatchSchema = z.object({
  model: z.string().trim().min(1).max(100),
  results: z.array(aiReviewItemSchema).max(200),
});

export type AiReviewItem = z.infer<typeof aiReviewItemSchema>;
export type AiReviewBatch = z.infer<typeof aiReviewBatchSchema>;

export type AutoDecisionFlags = { autoApprove: boolean; autoReject: boolean; minConfidence: number };
export type AutoAction = "approve" | "reject" | "none";

const DEFAULT_MIN_CONFIDENCE = 0.9;

/** Bayraklar yalnız `"1"` ile açılır; boş/başka değer = kapalı. Eşik 0..1 dışındaysa varsayılan (0.9). */
export function readAutoDecisionFlags(env: Record<string, string | undefined>): AutoDecisionFlags {
  const parsed = Number(env.AI_REVIEW_MIN_CONFIDENCE);
  const minConfidence = Number.isFinite(parsed) && parsed > 0 && parsed <= 1 ? parsed : DEFAULT_MIN_CONFIDENCE;
  return { autoApprove: env.AI_REVIEW_AUTO_APPROVE === "1", autoReject: env.AI_REVIEW_AUTO_REJECT === "1", minConfidence };
}

/** RED her güvende reddedilir; ONAY yalnız eşiğin üstünde onaylanır; BELİRSİZ her zaman insanda kalır. */
export function autoAction(item: Pick<AiReviewItem, "verdict" | "confidence">, flags: AutoDecisionFlags): AutoAction {
  if (item.verdict === "RED" && flags.autoReject && item.confidence >= flags.minConfidence) return "reject";
  if (item.verdict === "ONAY" && flags.autoApprove && item.confidence >= flags.minConfidence) return "approve";
  return "none";
}

/** Reddin onay kuyruğundaki notu: insan notundan ayırt edilir, 500 karakter sınırına uyar. */
export function autoRejectNote(reason: string | null): string {
  return `Otomatik red (Haiku): ${reason ?? "gerekçe yok"}`.slice(0, 500);
}

/**
 * Kitap PDF'inden çıkan metinde formüller kayıp (notlarda bilinen sınır): bu derslerde Haiku "metinde yok" diyebilir ya da
 * kayıp formül yüzünden yanlış onaylayabilir. Desteler için bu derslerde otomatik karar verilmez (rozet kalır).
 */
export const FORMULA_HEAVY_SUBJECTS = ["Matematik", "Geometri", "Fizik", "Kimya"] as const;

export function deckAutoEligible(subject: string): boolean {
  const key = subject.trim().toLocaleLowerCase("tr-TR");
  return !FORMULA_HEAVY_SUBJECTS.some((s) => key.includes(s.toLocaleLowerCase("tr-TR")));
}
