import { HttpError, ok, parseBody, requireStaff, route } from "@/lib/api/server";
import { leadCreateSchema } from "@/lib/domain/crm/schemas";
import { createLead, listLeads } from "@/lib/server/crm-leads";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Adaylar (tümü; ekran istemcide süzer). `?institutionId=` verilirse o kuruma bağlı aday (0 ya da 1 satır —
 * CRM_LEAD_USER_ID_FILTER karşılığı). CRM_AGENT için tutarlar sunucuda null.
 */
export const GET = route(async (request: Request) => {
  const staff = await requireStaff();
  const institutionId = new URL(request.url).searchParams.get("institutionId");
  if (institutionId !== null && !UUID.test(institutionId)) throw new HttpError(400, "VALIDATION");
  return ok(await listLeads(staff, institutionId ? { institutionId } : {}));
});

/** Yeni aday (her CRM kullanıcısı). Aktör oturumdan; CRM_AGENT'ın gönderdiği tutarlar yok sayılır. */
export const POST = route(async (request: Request) => {
  const staff = await requireStaff();
  return ok(await createLead(await parseBody(request, leadCreateSchema), staff), 201);
});
