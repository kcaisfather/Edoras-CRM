import { ok, requireStaff, requireUuid, route } from "@/lib/api/server";
import { revokeQuestionApproval } from "@/lib/server/question-pool";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Onayı geri al: soru kuyruğa döner, Mini Test'te pasifleşir. Yalnız ADMIN. */
export const POST = route(async (_request: Request, { params }: Ctx) => {
  const staff = await requireStaff({ role: "ADMIN" });
  return ok(await revokeQuestionApproval(requireUuid((await params).id), staff));
});
