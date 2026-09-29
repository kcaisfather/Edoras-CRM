import { z } from "zod";
import { ok, parseBody, requireStaff, route } from "@/lib/api/server";
import { listInternalInstitutions, markInternal } from "@/lib/server/internal-institutions";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  await requireStaff();
  return ok(await listInternalInstitutions());
});

/** Kurumu iç / sunum kurumu olarak işaretle (yalnız ADMIN). */
export const POST = route(async (request: Request) => {
  const actor = await requireStaff({ role: "ADMIN" });
  const body = await parseBody(request, z.object({ institutionId: z.uuid(), note: z.string().trim().max(200).optional() }));
  await markInternal(body.institutionId, body.note ?? null, actor);
  return ok({ ok: true }, 201);
});
