import {
  HttpError,
  ok,
  requireStaff,
  requireUuid,
  route,
} from "@/lib/api/server";
import {
  closeEdorasQuestionObjections,
  getEdorasQuestionCrmId,
} from "@/lib/server/edoras";
import { revokeQuestionApproval } from "@/lib/server/question-pool";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ questionId: string }> };

const ACTIONS = ["revoke", "resolve", "dismiss"] as const;

/**
 * Bir sorunun açık itirazları üzerinde karar (yalnız ADMIN). Gövde `{ action }`:
 *  - `revoke`: soruyu onaydan geri al (kuyruğa döner, öğrencilere kapanır) + itirazları ÇÖZÜLDÜ say;
 *  - `resolve`: itiraz haklı/giderildi, soru kalır;
 *  - `dismiss`: itiraz yersiz, soru kalır.
 */
export const POST = route(async (request: Request, { params }: Ctx) => {
  const staff = await requireStaff({ role: "ADMIN" });
  const questionId = requireUuid((await params).questionId);
  const body = (await request.json().catch(() => null)) as {
    action?: unknown;
  } | null;
  const action = ACTIONS.find((a) => a === body?.action);
  if (!action) throw new HttpError(400, "VALIDATION");

  if (action === "revoke") {
    const crmId = await getEdorasQuestionCrmId(questionId);
    if (!crmId) throw new HttpError(404, "NOT_FOUND");
    await revokeQuestionApproval(crmId, staff);
  }
  await closeEdorasQuestionObjections(
    questionId,
    action === "dismiss" ? "DISMISSED" : "RESOLVED",
  );
  return ok({ ok: true });
});
