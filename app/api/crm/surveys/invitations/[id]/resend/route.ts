import { assertSameOrigin, ok, requireStaff, requireUuid, route } from "@/lib/api/server";
import { appOrigin } from "@/lib/server/app-url";
import { resendInvitation } from "@/lib/server/crm-surveys";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * E-posta davetini yeniden gönderir (her CRM kullanıcısı; yalnız EMAIL kanalı). Yanıtlanmış 409, süresi dolmuş 410,
 * e-posta kapalı 503, gönderilemedi 502.
 */
export const POST = route(async (request: Request, { params }: Ctx) => {
  assertSameOrigin(request);
  const staff = await requireStaff();
  const id = requireUuid((await params).id);
  return ok(await resendInvitation(id, staff, appOrigin(request)));
});
