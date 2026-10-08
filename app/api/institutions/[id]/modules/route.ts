import { ok, parseBody, requireStaff, requireUuid, route } from "@/lib/api/server";
import { panelModuleToggleSchema } from "@/lib/domain/institutions/panel-modules";
import { listPanelModules, setPanelModule } from "@/lib/server/panel-modules";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Kurumun Edoras panel modülleri — her personel görür. */
export const GET = route(async (_request: Request, { params }: Ctx) => {
  await requireStaff();
  const id = requireUuid((await params).id);
  return ok(await listPanelModules(id));
});

/** Tek modülü aç / kapat — yalnız ADMIN (ücretli modül kararı). */
export const PATCH = route(async (request: Request, { params }: Ctx) => {
  const staff = await requireStaff({ role: "ADMIN" });
  const id = requireUuid((await params).id);
  return ok(await setPanelModule(id, await parseBody(request, panelModuleToggleSchema), staff));
});
