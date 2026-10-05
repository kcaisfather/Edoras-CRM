import { HttpError, ok, parseBody, requireStaff, route } from "@/lib/api/server";
import { TICKET_STATUSES, ticketCreateSchema, type TicketStatus } from "@/lib/domain/tickets/types";
import { createTicket, listTickets } from "@/lib/server/crm-tickets";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Destek talepleri (her CRM kullanıcısı). `?institutionId=`, `?status=`, `?assigneeId=` ile daraltılır. */
export const GET = route(async (request: Request) => {
  await requireStaff();
  const p = new URL(request.url).searchParams;
  const institutionId = p.get("institutionId");
  const assigneeId = p.get("assigneeId");
  const status = p.get("status");
  if ((institutionId !== null && !UUID.test(institutionId)) || (assigneeId !== null && !UUID.test(assigneeId))) throw new HttpError(400, "VALIDATION");
  if (status !== null && !(TICKET_STATUSES as readonly string[]).includes(status)) throw new HttpError(400, "VALIDATION");
  return ok(
    await listTickets({
      institutionId: institutionId ?? undefined,
      assigneeId: assigneeId ?? undefined,
      status: (status as TicketStatus | null) ?? undefined,
    })
  );
});

/** Talep aç (her CRM kullanıcısı). CRM_AGENT yalnız kendine atayabilir. */
export const POST = route(async (request: Request) => {
  const staff = await requireStaff();
  return ok(await createTicket(await parseBody(request, ticketCreateSchema), staff), 201);
});
