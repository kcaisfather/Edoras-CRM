import { assertSameOrigin, ok, requireStaff, requireUuid, route } from "@/lib/api/server";
import { markInvitationSent } from "@/lib/server/crm-surveys";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * "Gönderdim": WhatsApp / SMS / Link davetini personel gönderdiğini işaretler (CREATED → SENT; anket araması bu andan
 * sayılır). Başka durumdaki davette değişiklik yok (idempotent). E-posta davetinde 400.
 */
export const POST = route(async (request: Request, { params }: Ctx) => {
  assertSameOrigin(request);
  const staff = await requireStaff();
  const id = requireUuid((await params).id);
  return ok(await markInvitationSent(id, staff));
});
