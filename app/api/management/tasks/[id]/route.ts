import { assertSameOrigin, ok, parseBody, requireIntId, requireStaff, route } from "@/lib/api/server";
import { kcaTaskPatchSchema } from "@/lib/domain/kca/types";
import { kcaDeleteTask, kcaTaskDetail, kcaUpdateTask } from "@/lib/server/kca";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Görev + yorumlar + geçmiş + proje üyeleri + yetkiler. Edoras dışı / görülmeyen görev 404. */
export const GET = route(async (_request: Request, { params }: Ctx) => {
  const staff = await requireStaff();
  return ok(await kcaTaskDetail(staff, requireIntId((await params).id)));
});

/** Kısmi güncelleme (KCA Panel kuralları: bilgi alanı / son tarih / durum yetkileri; taşıma yalnız Edoras projeleri arasında). */
export const PATCH = route(async (request: Request, { params }: Ctx) => {
  const staff = await requireStaff();
  const id = requireIntId((await params).id);
  return ok(await kcaUpdateTask(staff, id, await parseBody(request, kcaTaskPatchSchema)));
});

/** Sil (görev girme yetkisi; yorum, geçmiş ve yıldızlarla birlikte — KCA Panel deleteTask). */
export const DELETE = route(async (request: Request, { params }: Ctx) => {
  const staff = await requireStaff();
  assertSameOrigin(request);
  return ok(await kcaDeleteTask(staff, requireIntId((await params).id)));
});
