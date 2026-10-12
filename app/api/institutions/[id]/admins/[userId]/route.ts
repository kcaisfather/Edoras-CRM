import { ok, parseBody, requireStaff, requireUuid, route } from "@/lib/api/server";
import { adminEmailSchema } from "@/lib/domain/institutions/edoras-accounts";
import { changeAdminEmail } from "@/lib/server/institution-admin-accounts";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; userId: string }> };

/**
 * Edoras kurum yöneticisinin giriş e-postası — yalnız ADMIN. Auth + `profiles.email` birlikte değişir; telefon / TC
 * ile giren hesapta 409 EDORAS_LOGIN_NOT_EMAIL, adres başka hesapta 409 EMAIL_TAKEN.
 */
export const PATCH = route(async (request: Request, { params }: Ctx) => {
  const staff = await requireStaff({ role: "ADMIN" });
  const { id, userId } = await params;
  const institutionId = requireUuid(id);
  const adminUserId = requireUuid(userId);
  return ok(await changeAdminEmail(institutionId, adminUserId, await parseBody(request, adminEmailSchema), staff));
});
