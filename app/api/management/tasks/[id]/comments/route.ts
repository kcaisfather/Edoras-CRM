import { ok, parseBody, requireIntId, requireStaff, route } from "@/lib/api/server";
import { kcaCommentSchema } from "@/lib/domain/kca/types";
import { kcaAddTaskComment } from "@/lib/server/kca";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Görevin güncellemelerine not ekle (görevi gören herkes). → görev ayrıntısı. */
export const POST = route(async (request: Request, { params }: Ctx) => {
  const staff = await requireStaff();
  const id = requireIntId((await params).id);
  return ok(await kcaAddTaskComment(staff, id, (await parseBody(request, kcaCommentSchema)).body), 201);
});
