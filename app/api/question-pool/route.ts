import { ok, requireStaff, route } from "@/lib/api/server";
import { listApprovedQuestions, listPendingQuestions } from "@/lib/server/question-pool";

export const dynamic = "force-dynamic";

/** Gece soruları (AIG + LLM): onay bekleyenler ya da `?status=approved` ile onaylananlar. Yalnız ADMIN. */
export const GET = route(async (request: Request) => {
  await requireStaff({ role: "ADMIN" });
  const approved = new URL(request.url).searchParams.get("status") === "approved";
  return ok(approved ? await listApprovedQuestions() : await listPendingQuestions());
});
