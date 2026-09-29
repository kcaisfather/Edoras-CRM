import { ok, requireStaff, route } from "@/lib/api/server";
import type { CurrentUser } from "@/lib/domain/auth/types";

export const dynamic = "force-dynamic";

/** Oturumdaki CRM kullanıcısı. crm_staff kaydı yoksa 403 NOT_STAFF (giriş formu bunu gösterir). */
export const GET = route(async () => {
  const staff = await requireStaff();
  const user: CurrentUser = { id: staff.userId, email: staff.email, fullName: staff.fullName, role: staff.role };
  return ok(user);
});
