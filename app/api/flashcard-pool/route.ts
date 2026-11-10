import { ok, requireStaff, route } from "@/lib/api/server";
import { listApprovedDecks, listPendingDecks } from "@/lib/server/flashcard-pool";

export const dynamic = "force-dynamic";

/** Gece üretilen bilgi kartı desteleri: onay bekleyenler ya da `?status=approved` ile onaylananlar. Yalnız ADMIN. */
export const GET = route(async (request: Request) => {
  await requireStaff({ role: "ADMIN" });
  const approved = new URL(request.url).searchParams.get("status") === "approved";
  return ok(approved ? await listApprovedDecks() : await listPendingDecks());
});
