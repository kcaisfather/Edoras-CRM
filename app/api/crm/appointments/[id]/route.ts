import { ok, parseBody, requireStaff, requireUuid, route } from "@/lib/api/server";
import { appointmentPatchSchema } from "@/lib/domain/crm/appointment";
import { updateAppointment } from "@/lib/server/crm-appointments";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Açık randevuyu yeniden planla ya da kapat (`status`: HELD / NO_SHOW / CANCELLED). Kapanmış randevu 409. */
export const PATCH = route(async (request: Request, { params }: Ctx) => {
  const staff = await requireStaff();
  const id = requireUuid((await params).id);
  return ok(await updateAppointment(id, await parseBody(request, appointmentPatchSchema), staff));
});
