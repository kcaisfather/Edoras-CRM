import { ok, parseBody, requireStaff, requireUuid, route } from "@/lib/api/server";
import { licenseEditSchema } from "@/lib/domain/institutions/schemas";
import { updateLicense } from "@/lib/server/institutions";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; licenseId: string }> };

/** Lisans düzelt: başlangıç (bitiş +1 yıl), bedel (indirim yüzdesi ya da elle), not. Yalnız ADMIN. */
export const PATCH = route(async (request: Request, { params }: Ctx) => {
  const staff = await requireStaff({ role: "ADMIN" });
  const { id, licenseId } = await params;
  await updateLicense(requireUuid(id), requireUuid(licenseId), await parseBody(request, licenseEditSchema), staff);
  return ok({ ok: true });
});
