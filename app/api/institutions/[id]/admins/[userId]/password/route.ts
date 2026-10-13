import { ok, parseBody, requireStaff, requireUuid, route } from "@/lib/api/server";
import { adminPasswordResetSchema } from "@/lib/domain/institutions/edoras-accounts";
import { resetAdminPassword } from "@/lib/server/institution-admin-accounts";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; userId: string }> };

/**
 * Edoras kurum yöneticisine yeni şifre — yalnız ADMIN. Gövdede `password` verilirse o yazılır, yoksa geçici şifre
 * üretilir. Şifre yanıtta bir kez döner, saklanmaz.
 */
export const POST = route(async (request: Request, { params }: Ctx) => {
  const staff = await requireStaff({ role: "ADMIN" });
  const { id, userId } = await params;
  const institutionId = requireUuid(id);
  const adminUserId = requireUuid(userId);
  const input = await parseBody(request, adminPasswordResetSchema);
  return ok(await resetAdminPassword(institutionId, adminUserId, input, staff));
});
