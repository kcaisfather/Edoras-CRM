/** Ekip (CRM personeli) istemci modülü — /api/staff uçları (yalnız ADMIN). */
import { apiRequest } from "@/lib/api/client";
import type { PanelRole } from "@/lib/domain/auth/types";
import type { InviteInput, StaffInviteResult, StaffMember, StaffStatus } from "@/lib/domain/staff/logic";

export const teamKeys = {
  all: ["settings", "team"] as const,
  list: () => [...teamKeys.all, "list"] as const,
};

export const teamApi = {
  list: (signal?: AbortSignal) => apiRequest<StaffMember[]>("/api/staff", { signal }),
  invite: (input: InviteInput) => apiRequest<StaffInviteResult>("/api/staff", { method: "POST", body: input }),
  update: (id: string, patch: { role?: PanelRole; status?: StaffStatus }) =>
    apiRequest<StaffMember>(`/api/staff/${encodeURIComponent(id)}`, { method: "PATCH", body: patch }),
  resetPassword: (id: string) =>
    apiRequest<{ temporaryPassword: string }>(`/api/staff/${encodeURIComponent(id)}/password`, { method: "POST", body: {} }),
};
