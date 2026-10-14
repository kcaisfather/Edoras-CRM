import { apiRequest } from "@/lib/api/client";
import type {
  KcaContactCreateInput,
  KcaContactDto,
  KcaContactPatchInput,
  KcaLinkInput,
  KcaMeetingCreateInput,
  KcaMeetingDetailDto,
  KcaMeetingDto,
  KcaMeetingPatchInput,
  KcaSessionDto,
  KcaTaskCreateInput,
  KcaTaskDetailDto,
  KcaTaskDto,
  KcaTaskPatchInput,
} from "@/lib/domain/kca/types";

const task = (id: number) => `/api/management/tasks/${id}`;
const meeting = (id: number) => `/api/management/meetings/${id}`;

/**
 * Yönetim (KCA Panel) uçları — hepsi requireStaff; veri KCA Panel'in Turso veritabanından, yalnız Edoras etiketli:
 *   GET    /api/management/session                    → KcaSessionDto (bağ durumu, Edoras projeleri, üyeler)
 *   POST   /api/management/link { email, password }   → KcaSessionDto · DELETE → bağı kaldır
 *   GET    /api/management/tasks                      → KcaTaskDto[] · POST → KcaTaskDetailDto
 *   GET    /api/management/tasks/{id}                 → KcaTaskDetailDto · PATCH · DELETE
 *   POST   /api/management/tasks/{id}/comments        · /approve · /request-changes → KcaTaskDetailDto
 *   GET    /api/management/meetings                   → KcaMeetingDto[] · POST → KcaMeetingDetailDto
 *   GET    /api/management/meetings/{id}              → KcaMeetingDetailDto · PATCH · DELETE
 *   POST   /api/management/meetings/{id}/processed    → KcaMeetingDetailDto
 *   GET    /api/management/contacts                   → KcaContactDto[] · POST → KcaContactDto
 *   PATCH  /api/management/contacts/{id}              → KcaContactDto · DELETE
 */
export const managementApi = {
  session: (signal?: AbortSignal) => apiRequest<KcaSessionDto>("/api/management/session", { signal }),
  link: (body: KcaLinkInput) => apiRequest<KcaSessionDto>("/api/management/link", { method: "POST", body }),
  unlink: () => apiRequest<{ ok: true }>("/api/management/link", { method: "DELETE" }),

  tasks: (signal?: AbortSignal) => apiRequest<KcaTaskDto[]>("/api/management/tasks", { signal }),
  task: (id: number, signal?: AbortSignal) => apiRequest<KcaTaskDetailDto>(task(id), { signal }),
  createTask: (body: KcaTaskCreateInput) => apiRequest<KcaTaskDetailDto>("/api/management/tasks", { method: "POST", body }),
  patchTask: (id: number, body: KcaTaskPatchInput) => apiRequest<KcaTaskDetailDto>(task(id), { method: "PATCH", body }),
  deleteTask: (id: number) => apiRequest<{ ok: true }>(task(id), { method: "DELETE" }),
  commentTask: (id: number, body: string) => apiRequest<KcaTaskDetailDto>(`${task(id)}/comments`, { method: "POST", body: { body } }),
  approveTask: (id: number, note: string | null) => apiRequest<KcaTaskDetailDto>(`${task(id)}/approve`, { method: "POST", body: { note } }),
  requestChanges: (id: number, note: string) => apiRequest<KcaTaskDetailDto>(`${task(id)}/request-changes`, { method: "POST", body: { note } }),

  meetings: (signal?: AbortSignal) => apiRequest<KcaMeetingDto[]>("/api/management/meetings", { signal }),
  meeting: (id: number, signal?: AbortSignal) => apiRequest<KcaMeetingDetailDto>(meeting(id), { signal }),
  createMeeting: (body: KcaMeetingCreateInput) => apiRequest<KcaMeetingDetailDto>("/api/management/meetings", { method: "POST", body }),
  patchMeeting: (id: number, body: KcaMeetingPatchInput) => apiRequest<KcaMeetingDetailDto>(meeting(id), { method: "PATCH", body }),
  deleteMeeting: (id: number) => apiRequest<{ ok: true }>(meeting(id), { method: "DELETE" }),
  setProcessed: (id: number, done: boolean, result: string | null) =>
    apiRequest<KcaMeetingDetailDto>(`${meeting(id)}/processed`, { method: "POST", body: { done, result } }),

  contacts: (signal?: AbortSignal) => apiRequest<KcaContactDto[]>("/api/management/contacts", { signal }),
  createContact: (body: KcaContactCreateInput) => apiRequest<KcaContactDto>("/api/management/contacts", { method: "POST", body }),
  patchContact: (id: number, body: KcaContactPatchInput) => apiRequest<KcaContactDto>(`/api/management/contacts/${id}`, { method: "PATCH", body }),
  deleteContact: (id: number) => apiRequest<{ ok: true }>(`/api/management/contacts/${id}`, { method: "DELETE" }),
};
