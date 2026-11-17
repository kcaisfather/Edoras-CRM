import { ok, requireStaff, route } from "@/lib/api/server";
import { parseAiFilter } from "@/lib/domain/ai-review/rules";
import { countPendingByAiVerdict } from "@/lib/server/ai-review-counts";
import { listApprovedQuestions, listPendingQuestions } from "@/lib/server/question-pool";

export const dynamic = "force-dynamic";

/** Gece soruları (AIG + LLM): onay bekleyenler ya da `?status=approved` ile onaylananlar. Yalnız ADMIN. */
export const GET = route(async (request: Request) => {
  await requireStaff({ role: "ADMIN" });
  const params = new URL(request.url).searchParams;
  // `?summary=1`: bekleyenlerin Haiku kararına göre sayıları (süzgeç düğmeleri). `?ai=RED|BELIRSIZ|ONAY|NONE`: süzülmüş liste.
  if (params.get("summary") === "1") return ok(await countPendingByAiVerdict("crm_question_pool"));
  const approved = params.get("status") === "approved";
  return ok(approved ? await listApprovedQuestions() : await listPendingQuestions(200, parseAiFilter(params.get("ai"))));
});
