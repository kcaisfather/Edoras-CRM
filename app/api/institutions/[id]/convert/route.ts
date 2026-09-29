import { ok, parseBody, requireStaff, requireUuid, route } from "@/lib/api/server";
import { convertSchema } from "@/lib/domain/institutions/schemas";
import { convertToPaid } from "@/lib/server/institutions";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Demo → ücretli (yalnız ADMIN). Adres + TC/VKN yoksa veritabanı da reddeder. */
export const POST = route(async (request: Request, { params }: Ctx) => {
  const staff = await requireStaff({ role: "ADMIN" });
  const id = requireUuid((await params).id);
  await convertToPaid(id, await parseBody(request, convertSchema), staff);
  return ok({ ok: true });
});
