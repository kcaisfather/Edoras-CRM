import { ok, parseBoundedBody, route } from "@/lib/api/server";
import { PUBLIC_TICKET_MAX_BYTES, publicTicketSchema } from "@/lib/domain/tickets/types";
import { openPublicTicketPage, submitPublicTicket } from "@/lib/server/public-tickets";
import { publicRateLimit } from "@/lib/server/public-surveys";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

/** HERKESE AÇIK: destek formunun açılış verisi — yalnız kurum adı. Geçersiz token 404, oran sınırı 429 — asla 401. */
export const GET = route(async (request: Request, { params }: Ctx) => {
  const { token } = await params;
  const limited = publicRateLimit(request, token, "read");
  if (limited) return limited;
  return ok(await openPublicTicketPage(token));
});

/**
 * HERKESE AÇIK talep gönderme: `{ subject, description, name, email, phone }` (gövde ≤ 16 KB, aynı origin) → 201 `{ number }`.
 * Kurum token üzerinden belirlenir. Geçersiz token 404, hatalı alan 400/422, oran sınırı 429 (kurum başına günde 20 talep dahil).
 */
export const POST = route(async (request: Request, { params }: Ctx) => {
  const { token } = await params;
  const limited = publicRateLimit(request, token, "write");
  if (limited) return limited;
  const values = await parseBoundedBody(request, publicTicketSchema, PUBLIC_TICKET_MAX_BYTES);
  return ok(await submitPublicTicket(token, values), 201);
});
