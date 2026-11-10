import { ok, requireStaff, requireUuid, route } from "@/lib/api/server";
import { revokeDeckApproval } from "@/lib/server/flashcard-pool";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Onayı geri al: deste kuyruğa döner, kartları panelde pasifleşir. Yalnız ADMIN. */
export const POST = route(async (_request: Request, { params }: Ctx) => {
  const staff = await requireStaff({ role: "ADMIN" });
  return ok(await revokeDeckApproval(requireUuid((await params).id), staff));
});
