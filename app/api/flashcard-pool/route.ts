import { ok, requireStaff, route } from "@/lib/api/server";
import { parseAiFilter } from "@/lib/domain/ai-review/rules";
import { countPendingByAiVerdict } from "@/lib/server/ai-review-counts";
import { listApprovedDecks, listPendingDecks } from "@/lib/server/flashcard-pool";

export const dynamic = "force-dynamic";

/** Gece üretilen bilgi kartı desteleri: onay bekleyenler ya da `?status=approved` ile onaylananlar. Yalnız ADMIN. */
export const GET = route(async (request: Request) => {
  await requireStaff({ role: "ADMIN" });
  const params = new URL(request.url).searchParams;
  if (params.get("summary") === "1") return ok(await countPendingByAiVerdict("crm_flashcard_decks"));
  const approved = params.get("status") === "approved";
  return ok(approved ? await listApprovedDecks() : await listPendingDecks(100, parseAiFilter(params.get("ai"))));
});
