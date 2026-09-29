import { ok, parseBody, requireStaff, route } from "@/lib/api/server";
import { inviteSchema } from "@/lib/domain/staff/logic";
import { inviteStaff, listStaff } from "@/lib/server/staff";

export const dynamic = "force-dynamic";

/** Ekip listesi (yalnız ADMIN). */
export const GET = route(async () => {
  await requireStaff({ role: "ADMIN" });
  return ok(await listStaff());
});

/** CRM kullanıcısı aç (yalnız ADMIN). Yeni hesapta geçici şifre bir kez döner. */
export const POST = route(async (request: Request) => {
  const actor = await requireStaff({ role: "ADMIN" });
  return ok(await inviteStaff(await parseBody(request, inviteSchema), actor), 201);
});
