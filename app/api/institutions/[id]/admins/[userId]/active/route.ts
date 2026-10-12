import { ok, parseBody, requireStaff, requireUuid, route } from "@/lib/api/server";
import { adminActiveSchema } from "@/lib/domain/institutions/edoras-accounts";
import { changeAdminActive } from "@/lib/server/institution-admin-accounts";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; userId: string }> };

/**
 * Edoras kurum yöneticisi üyeliğini bu kurumda aktif / pasif yapar — yalnız ADMIN. Hesap silinmez. Son aktif yönetici
 * `confirmLastAdmin: true` olmadan pasife alınmaz (409 EDORAS_LAST_ADMIN).
 */
export const PATCH = route(async (request: Request, { params }: Ctx) => {
  const staff = await requireStaff({ role: "ADMIN" });
  const { id, userId } = await params;
  const institutionId = requireUuid(id);
  const adminUserId = requireUuid(userId);
  return ok(await changeAdminActive(institutionId, adminUserId, await parseBody(request, adminActiveSchema), staff));
});
