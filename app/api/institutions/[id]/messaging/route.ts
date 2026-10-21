import { ok, parseBody, requireStaff, requireUuid, route } from "@/lib/api/server";
import { messagingSettingToggleSchema } from "@/lib/domain/institutions/messaging-permissions";
import { listMessagingPermissions, setMessagingSetting } from "@/lib/server/messaging-permissions";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Kurumun mesajlaşma anahtarları + öğretmen yetkileri — her personel görür (modül kapalıysa boş). */
export const GET = route(async (_request: Request, { params }: Ctx) => {
  await requireStaff();
  const id = requireUuid((await params).id);
  return ok(await listMessagingPermissions(id));
});

/** Tek kurum anahtarı — yalnız ADMIN (modül anahtarıyla aynı karar düzeyi). */
export const PATCH = route(async (request: Request, { params }: Ctx) => {
  const staff = await requireStaff({ role: "ADMIN" });
  const id = requireUuid((await params).id);
  return ok(await setMessagingSetting(id, await parseBody(request, messagingSettingToggleSchema), staff));
});
