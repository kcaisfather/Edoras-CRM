import { ok, parseBody, requireStaff, route } from "@/lib/api/server";
import { costSettingsSchema } from "@/lib/domain/costs/schemas";
import { getCostSettings, updateCostSettings } from "@/lib/server/costs";

export const dynamic = "force-dynamic";

/** Maliyet ayarları (SMS birim fiyatı, TL / alıcı). Yalnız ADMIN. */
export const GET = route(async () => {
  await requireStaff({ role: "ADMIN" });
  return ok(await getCostSettings());
});

export const PUT = route(async (request: Request) => {
  const staff = await requireStaff({ role: "ADMIN" });
  return ok(await updateCostSettings(await parseBody(request, costSettingsSchema), staff));
});
