import { assertSameOrigin, ok, requireStaff, requireUuid, route } from "@/lib/api/server";
import { sendSubscriptionNow } from "@/lib/server/reports";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

/**
 * Raporu şimdi gönder → { sentTo, failed, sentAt } (adet; adres yok). Yalnız ADMIN. Zamanlamayı değiştirmez. E-posta
 * ayarsızsa 503 MAIL_NOT_CONFIGURED; aynı abonelik için 60 sn içinde ikinci istek 429.
 */
export const POST = route(async (request: Request, { params }: Ctx) => {
  assertSameOrigin(request);
  const staff = await requireStaff({ role: "ADMIN" });
  return ok(await sendSubscriptionNow(requireUuid((await params).id), staff));
});
