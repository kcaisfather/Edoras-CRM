import { ok, parseBody, requireStaff, requireUuid, route } from "@/lib/api/server";
import { ticketPatchSchema } from "@/lib/domain/tickets/types";
import { getTicket, updateTicket } from "@/lib/server/crm-tickets";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Talep + notlar (her CRM kullanıcısı). */
export const GET = route(async (_request: Request, { params }: Ctx) => {
  await requireStaff();
  return ok(await getTicket(requireUuid((await params).id)));
});

/** Kısmi güncelleme: konu, açıklama, durum, öncelik, sorumlu. */
export const PATCH = route(async (request: Request, { params }: Ctx) => {
  const staff = await requireStaff();
  const id = requireUuid((await params).id);
  return ok(await updateTicket(id, await parseBody(request, ticketPatchSchema), staff));
});
