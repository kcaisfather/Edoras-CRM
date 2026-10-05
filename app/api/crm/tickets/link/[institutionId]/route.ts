import { ok, parseBody, requireStaff, requireUuid, route } from "@/lib/api/server";
import { ticketLinkSchema } from "@/lib/domain/tickets/types";
import { ensureTicketLink } from "@/lib/server/crm-tickets";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ institutionId: string }> };

/**
 * Kurumun destek bağlantısı (token): yoksa oluşturulur. `{ rotate: true }` bağlantıyı yeniler ve ESKİSİNİ GEÇERSİZ KILAR.
 * Sayfa yolu /t/{token}. → { token, createdAt }
 */
export const POST = route(async (request: Request, { params }: Ctx) => {
  const staff = await requireStaff();
  const id = requireUuid((await params).institutionId);
  const { rotate } = await parseBody(request, ticketLinkSchema);
  return ok(await ensureTicketLink(id, rotate, staff));
});
