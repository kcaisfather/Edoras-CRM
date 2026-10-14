import { assertSameOrigin, ok, parseBody, requireIntId, requireStaff, route } from "@/lib/api/server";
import { kcaMeetingPatchSchema } from "@/lib/domain/kca/types";
import { kcaDeleteMeeting, kcaMeetingDetail, kcaUpdateMeeting } from "@/lib/server/kca";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Not + çıkan Edoras görevleri. Görülmeyen / Edoras dışı not 404. */
export const GET = route(async (_request: Request, { params }: Ctx) => {
  const staff = await requireStaff();
  return ok(await kcaMeetingDetail(staff, requireIntId((await params).id)));
});

/** Düzenle — yalnız sahibi; firma yalnız Edoras projeleri arasında değişir. */
export const PATCH = route(async (request: Request, { params }: Ctx) => {
  const staff = await requireStaff();
  const id = requireIntId((await params).id);
  return ok(await kcaUpdateMeeting(staff, id, await parseBody(request, kcaMeetingPatchSchema)));
});

/** Sil — yalnız sahibi; çıkan görevler kalır. */
export const DELETE = route(async (request: Request, { params }: Ctx) => {
  const staff = await requireStaff();
  assertSameOrigin(request);
  return ok(await kcaDeleteMeeting(staff, requireIntId((await params).id)));
});
