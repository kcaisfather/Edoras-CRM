import { ok, parseBody, requireStaff, requireUuid, route } from "@/lib/api/server";
import { staffPatchSchema } from "@/lib/domain/staff/logic";
import { updateStaff } from "@/lib/server/staff";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Rol ya da durum (aktif/kapalı) değiştir — yalnız süper admin; kendi hesabı ve son aktif yönetici korunur. */
export const PATCH = route(async (request: Request, { params }: Ctx) => {
  const actor = await requireStaff({ role: "ADMIN", super: true });
  const id = requireUuid((await params).id);
  return ok(await updateStaff(id, await parseBody(request, staffPatchSchema), actor));
});
