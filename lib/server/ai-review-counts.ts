import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { dbError } from "@/lib/api/server";
import type { AiVerdict } from "@/lib/domain/ai-review/rules";

export type AiCounts = { ONAY: number; RED: number; BELIRSIZ: number; NONE: number };

/** Bekleyenlerin Haiku kararına göre sayısı (listenin 200 satır sınırından bağımsız: süzgeç düğmelerindeki sayılar). */
export async function countPendingByAiVerdict(table: "crm_question_pool" | "crm_flashcard_decks"): Promise<AiCounts> {
  const admin = getSupabaseAdminClient();
  const count = async (verdict: AiVerdict | null) => {
    let query = admin.from(table).select("id", { count: "exact", head: true }).eq("status", "PENDING");
    query = verdict === null ? query.is("ai_verdict", null) : query.eq("ai_verdict", verdict);
    const { count: n, error } = await query;
    if (error) throw dbError(error);
    return n ?? 0;
  };
  const [ONAY, RED, BELIRSIZ, NONE] = await Promise.all([count("ONAY"), count("RED"), count("BELIRSIZ"), count(null)]);
  return { ONAY, RED, BELIRSIZ, NONE };
}
