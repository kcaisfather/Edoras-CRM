import { ok, parseBody, requireStaff, requireUuid, route } from "@/lib/api/server";
import { renewSchema } from "@/lib/domain/institutions/schemas";
import { renewLicense } from "@/lib/server/institutions";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Lisans yenile: 1 yıl, süren lisansın bitişinden (bitmişse bugünden). Bedel: indirim yüzdesi ya da elle. Yalnız ADMIN. */
export const POST = route(async (request: Request, { params }: Ctx) => {
  const staff = await requireStaff({ role: "ADMIN" });
  const id = requireUuid((await params).id);
  await renewLicense(id, await parseBody(request, renewSchema), staff);
  return ok({ ok: true }, 201);
});
