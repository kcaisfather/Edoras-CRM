import { assertSameOrigin, ok, parseBody, requireStaff, requireUuid, route } from "@/lib/api/server";
import { leadLinkSchema } from "@/lib/domain/crm/schemas";
import { linkLead, unlinkLead } from "@/lib/server/crm-leads";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Adayı mevcut bir Edoras kurumuna bağla (kurum başına tek aday → 409 LEAD_INSTITUTION_TAKEN). */
export const POST = route(async (request: Request, { params }: Ctx) => {
  const staff = await requireStaff();
  const id = requireUuid((await params).id);
  const { institutionId } = await parseBody(request, leadLinkSchema);
  return ok(await linkLead(id, institutionId, staff));
});

/** Kurum bağlantısını kaldır. */
export const DELETE = route(async (request: Request, { params }: Ctx) => {
  assertSameOrigin(request);
  const staff = await requireStaff();
  const id = requireUuid((await params).id);
  return ok(await unlinkLead(id, staff));
});
