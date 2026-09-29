import { ok, parseBody, requireStaff, route } from "@/lib/api/server";
import { prospectListCreateSchema } from "@/lib/domain/cold-lists/schemas";
import { createProspectList, listProspectLists } from "@/lib/server/crm-prospects";

export const dynamic = "force-dynamic";

/** Soğuk listeler (eskiden yeniye) + kişi sayıları — her CRM kullanıcısı; listeler ekipçe paylaşılır. */
export const GET = route(async () => {
  await requireStaff();
  return ok(await listProspectLists());
});

/** Yeni liste (her CRM kullanıcısı; içe aktarmanın ilk adımı). Açan oturumdan. */
export const POST = route(async (request: Request) => {
  const staff = await requireStaff();
  return ok(await createProspectList(await parseBody(request, prospectListCreateSchema), staff), 201);
});
