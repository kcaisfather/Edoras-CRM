import { HttpError, ok, requireStaff, requireUuid, route } from "@/lib/api/server";
import { parseWindowDays } from "@/lib/domain/growth/usage";
import { getEdorasInstitution } from "@/lib/server/edoras";
import { getStaffActivity } from "@/lib/server/edoras-usage";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Kurumun personeli × işlem türü (kurum ayrıntısındaki "Öğretmen kullanımı" kartı). Kurum Edoras'ta yoksa 404. */
export const GET = route(async (request: Request, { params }: Ctx) => {
  await requireStaff();
  const id = requireUuid((await params).id);
  if (!(await getEdorasInstitution(id))) throw new HttpError(404, "NOT_FOUND");
  const window = parseWindowDays(new URL(request.url).searchParams.get("window"));
  return ok(await getStaffActivity(id, window));
});
