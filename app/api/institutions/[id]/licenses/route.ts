import { ok, parseBody, requireStaff, requireUuid, route } from "@/lib/api/server";
import { renewSchema } from "@/lib/domain/institutions/schemas";
import { parseAmount } from "@/lib/utils/money";
import { renewLicense } from "@/lib/server/institutions";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Lisans yenile: 1 yıl, süren lisansın bitişinden (bitmişse bugünden). Yalnız ADMIN. */
export const POST = route(async (request: Request, { params }: Ctx) => {
  const staff = await requireStaff({ role: "ADMIN" });
  const id = requireUuid((await params).id);
  const input = await parseBody(request, renewSchema);
  await renewLicense(id, parseAmount(input.licensePrice) as number, staff);
  return ok({ ok: true }, 201);
});
