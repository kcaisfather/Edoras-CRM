import { ok, parseBody, requireStaff, requireUuid, route } from "@/lib/api/server";
import { questionDecisionSchema } from "@/lib/domain/question-pool/schemas";
import { decideQuestion } from "@/lib/server/question-pool";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Soruyu onayla ya da reddet (yalnız bekleyen satır). Yalnız ADMIN. */
export const PATCH = route(async (request: Request, { params }: Ctx) => {
  const staff = await requireStaff({ role: "ADMIN" });
  const id = requireUuid((await params).id);
  return ok(await decideQuestion(id, await parseBody(request, questionDecisionSchema), staff));
});
