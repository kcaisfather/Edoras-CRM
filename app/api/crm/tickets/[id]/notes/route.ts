import { ok, parseBody, requireStaff, requireUuid, route } from "@/lib/api/server";
import { ticketNoteSchema } from "@/lib/domain/tickets/types";
import { addTicketNote } from "@/lib/server/crm-tickets";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Talebe ekip notu ekle (yalnız ekibe görünür; müşteri görmez). → güncel talep. */
export const POST = route(async (request: Request, { params }: Ctx) => {
  const staff = await requireStaff();
  const id = requireUuid((await params).id);
  return ok(await addTicketNote(id, (await parseBody(request, ticketNoteSchema)).body, staff), 201);
});
