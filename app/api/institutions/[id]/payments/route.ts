import { ok, parseBody, requireStaff, requireUuid, route } from "@/lib/api/server";
import { paymentSchema } from "@/lib/domain/institutions/schemas";
import { recordPayment } from "@/lib/server/institutions";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Ödeme kaydı (yalnız ADMIN). Adres + TC/VKN yoksa veritabanı reddeder. */
export const POST = route(async (request: Request, { params }: Ctx) => {
  const staff = await requireStaff({ role: "ADMIN" });
  const id = requireUuid((await params).id);
  await recordPayment(id, await parseBody(request, paymentSchema), staff);
  return ok({ ok: true }, 201);
});
