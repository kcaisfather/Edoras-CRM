import { ok, parseBody, requireStaff, route } from "@/lib/api/server";
import { licenseListPriceSchema } from "@/lib/domain/institutions/schemas";
import { getLicensePricing, updateLicenseListPrice } from "@/lib/server/institutions";
import { parseAmount } from "@/lib/utils/money";

export const dynamic = "force-dynamic";

/** Lisans liste fiyatı (satışta indirim yüzdesi buna uygulanır). Yalnız ADMIN. */
export const GET = route(async () => {
  await requireStaff({ role: "ADMIN" });
  return ok(await getLicensePricing());
});

export const PUT = route(async (request: Request) => {
  const staff = await requireStaff({ role: "ADMIN" });
  const input = await parseBody(request, licenseListPriceSchema);
  return ok(await updateLicenseListPrice(parseAmount(input.listPrice) as number, staff));
});
