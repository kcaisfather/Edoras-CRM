import { ok, requireStaff, route } from "@/lib/api/server";
import { listPendingQuestions } from "@/lib/server/question-pool";

export const dynamic = "force-dynamic";

/** Onay bekleyen gece soruları (AIG + LLM), en yeni önce. Yalnız ADMIN. */
export const GET = route(async () => {
  await requireStaff({ role: "ADMIN" });
  return ok(await listPendingQuestions());
});
