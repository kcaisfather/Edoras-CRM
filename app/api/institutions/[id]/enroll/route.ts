import { ok, parseBody, requireStaff, requireUuid, route } from "@/lib/api/server";
import { enrollSchema } from "@/lib/domain/institutions/schemas";
import { enrollInstitution } from "@/lib/server/institutions";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** CRM öncesinden kalan kurumu kayda alır. DEMO herkes; UCRETLI (fatura + lisans) yalnız ADMIN. */
export const POST = route(async (request: Request, { params }: Ctx) => {
  const staff = await requireStaff();
  const id = requireUuid((await params).id);
  await enrollInstitution(id, await parseBody(request, enrollSchema), staff);
  return ok({ ok: true }, 201);
});
