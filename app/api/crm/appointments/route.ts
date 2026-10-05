import { HttpError, ok, parseBody, requireStaff, route } from "@/lib/api/server";
import { APPOINTMENT_STATUSES, appointmentCreateSchema, isRealDate, type AppointmentStatus } from "@/lib/domain/crm/appointment";
import { createAppointment, listAppointments } from "@/lib/server/crm-appointments";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Randevular (her CRM kullanıcısı). `?leadId=` o adayın tüm randevuları (geçmiş dahil); verilmezse açık randevular.
 * `?status=`, `?from=` ve `?to=` (YYYY-MM-DD, İstanbul günü) ile daraltılır.
 */
export const GET = route(async (request: Request) => {
  await requireStaff();
  const p = new URL(request.url).searchParams;
  const leadId = p.get("leadId");
  const status = p.get("status");
  const from = p.get("from");
  const to = p.get("to");
  if (leadId !== null && !UUID.test(leadId)) throw new HttpError(400, "VALIDATION");
  if (status !== null && !(APPOINTMENT_STATUSES as readonly string[]).includes(status)) throw new HttpError(400, "VALIDATION");
  if ((from !== null && !isRealDate(from)) || (to !== null && !isRealDate(to))) throw new HttpError(400, "VALIDATION");
  return ok(
    await listAppointments({
      leadId: leadId ?? undefined,
      status: (status as AppointmentStatus | null) ?? undefined,
      from: from ?? undefined,
      to: to ?? undefined,
    })
  );
});

/** Randevu planla (her CRM kullanıcısı). Görüşme öncesi aşamadaki aday "Randevu planlandı"ya geçer. */
export const POST = route(async (request: Request) => {
  const staff = await requireStaff();
  return ok(await createAppointment(await parseBody(request, appointmentCreateSchema), staff), 201);
});
