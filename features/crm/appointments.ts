"use client";

/**
 * Randevular — istemci modülü (GET/POST /api/crm/appointments, PATCH /api/crm/appointments/{id}). Yazımlardan sonra
 * randevu listesi ve aday listesi tazelenir (ilk randevu adayı "Randevu planlandı"ya taşır).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/client";
import {
  buildAppointmentIcs,
  appointmentIcsFileName,
  type Appointment,
  type AppointmentCreateInput,
  type AppointmentDto,
  type AppointmentPatchInput,
} from "@/lib/domain/crm/appointment";
import { crmKeys } from "./queries";

export const appointmentKeys = {
  all: ["crm", "appointments"] as const,
  forLead: (leadId: string) => [...appointmentKeys.all, "lead", leadId] as const,
};

const base = (id: string) => `/api/crm/appointments/${encodeURIComponent(id)}`;

export const appointmentsApi = {
  forLead: (leadId: string, signal?: AbortSignal) =>
    apiRequest<AppointmentDto[]>(`/api/crm/appointments?leadId=${encodeURIComponent(leadId)}`, { signal }),
  create: (input: AppointmentCreateInput) => apiRequest<AppointmentDto>("/api/crm/appointments", { method: "POST", body: input }),
  update: (id: string, input: AppointmentPatchInput) => apiRequest<AppointmentDto>(base(id), { method: "PATCH", body: input }),
};

/** Adayın tüm randevuları (başlangıca göre; geçmiş ve kapalı dahil). */
export function useLeadAppointments(leadId: string | null | undefined) {
  return useQuery({
    queryKey: appointmentKeys.forLead(leadId ?? ""),
    queryFn: ({ signal }) => appointmentsApi.forLead(leadId as string, signal),
    enabled: !!leadId,
    staleTime: 30 * 1000,
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () =>
    Promise.all([qc.invalidateQueries({ queryKey: appointmentKeys.all }), qc.invalidateQueries({ queryKey: crmKeys.all })]);
}

export function useCreateAppointment() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (input: AppointmentCreateInput) => appointmentsApi.create(input), onSuccess: invalidate });
}

export function useUpdateAppointment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: AppointmentPatchInput }) => appointmentsApi.update(id, data),
    onSuccess: invalidate,
  });
}

/** "Takvime ekle": .ics dosyasını tarayıcıda üretip indirir (sunucuya istek yok). */
export function downloadAppointmentIcs(input: { uid: string; title: string; appointment: Appointment; description?: string }) {
  if (typeof window === "undefined") return;
  const ics = buildAppointmentIcs(input);
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = appointmentIcsFileName(input.title, input.appointment.date);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
