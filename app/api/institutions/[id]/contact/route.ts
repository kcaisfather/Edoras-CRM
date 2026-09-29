import { ok, parseBody, requireStaff, requireUuid, route } from "@/lib/api/server";
import { contactSchema } from "@/lib/domain/institutions/schemas";
import { updateContact } from "@/lib/server/institutions";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route(async (request: Request, { params }: Ctx) => {
  await requireStaff();
  const id = requireUuid((await params).id);
  await updateContact(id, await parseBody(request, contactSchema));
  return ok({ ok: true });
});
