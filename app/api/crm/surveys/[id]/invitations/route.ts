import { HttpError, ok, parseBody, requireStaff, requireUuid, route } from "@/lib/api/server";
import { createInvitationSchema, invitationQuerySchema } from "@/lib/domain/surveys/schemas";
import { appOrigin } from "@/lib/server/app-url";
import { createInvitation, listInvitations } from "@/lib/server/crm-surveys";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Davetler, yeniden eskiye: `?status&channel&page&size` (page 0 tabanlı, size ≤ 200) → { items, page, size, total }. */
export const GET = route(async (request: Request, { params }: Ctx) => {
  await requireStaff();
  const id = requireUuid((await params).id);
  const sp = new URL(request.url).searchParams;
  const query = invitationQuerySchema.safeParse({
    status: sp.get("status") || undefined,
    channel: sp.get("channel") || undefined,
    page: sp.get("page") ?? undefined,
    size: sp.get("size") ?? undefined,
  });
  if (!query.success) throw new HttpError(400, "VALIDATION");
  return ok(await listInvitations(id, query.data));
});

/**
 * Tek alıcıya davet (her CRM kullanıcısı): `{ recipient: { leadId?, institutionId? }, channel }`. Alıcının iletişim
 * bilgisini sunucu aday / kurum kaydından okur. EMAIL hemen gönderilir (e-posta kapalıysa 503 MAIL_NOT_CONFIGURED,
 * gönderilemezse 502 MAIL_SEND_FAILED); 7 gün içinde yanıtsız davet varsa o döner (`reused: true`, 200).
 */
export const POST = route(async (request: Request, { params }: Ctx) => {
  const staff = await requireStaff();
  const id = requireUuid((await params).id);
  const body = await parseBody(request, createInvitationSchema);
  const invitation = await createInvitation(id, body, staff, appOrigin(request));
  return ok(invitation, invitation.reused ? 200 : 201);
});
