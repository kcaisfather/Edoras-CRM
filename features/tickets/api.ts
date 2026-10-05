import { ApiError, apiRequest } from "@/lib/api/client";
import { isApiErrorCode, type ApiErrorBody } from "@/lib/api/error-codes";
import type {
  PublicTicketInput,
  PublicTicketPage,
  TicketCreateInput,
  TicketDetailDto,
  TicketDto,
  TicketLinkDto,
  TicketPatchInput,
  TicketStatus,
} from "@/lib/domain/tickets/types";

const ticketBase = (id: string) => `/api/crm/tickets/${encodeURIComponent(id)}`;

/**
 * Destek talebi uçları (hepsi requireStaff):
 *   GET   /api/crm/tickets?institutionId&status&assigneeId   → TicketDto[]
 *   POST  /api/crm/tickets                                    → TicketDetailDto
 *   GET   /api/crm/tickets/{id}                               → TicketDetailDto (+ notlar)
 *   PATCH /api/crm/tickets/{id}                               → TicketDetailDto
 *   POST  /api/crm/tickets/{id}/notes { body }                → TicketDetailDto
 *   POST  /api/crm/tickets/link/{institutionId} { rotate }    → { token, createdAt }
 */
export const ticketsApi = {
  list: (params: { institutionId?: string; status?: TicketStatus }, signal?: AbortSignal) => {
    const sp = new URLSearchParams();
    if (params.institutionId) sp.set("institutionId", params.institutionId);
    if (params.status) sp.set("status", params.status);
    const qs = sp.toString();
    return apiRequest<TicketDto[]>(`/api/crm/tickets${qs ? `?${qs}` : ""}`, { signal });
  },
  get: (id: string, signal?: AbortSignal) => apiRequest<TicketDetailDto>(ticketBase(id), { signal }),
  create: (body: TicketCreateInput) => apiRequest<TicketDetailDto>("/api/crm/tickets", { method: "POST", body }),
  patch: (id: string, body: TicketPatchInput) => apiRequest<TicketDetailDto>(ticketBase(id), { method: "PATCH", body }),
  addNote: (id: string, body: string) => apiRequest<TicketDetailDto>(`${ticketBase(id)}/notes`, { method: "POST", body: { body } }),
  link: (institutionId: string, rotate: boolean) =>
    apiRequest<TicketLinkDto>(`/api/crm/tickets/link/${encodeURIComponent(institutionId)}`, { method: "POST", body: { rotate } }),
};

// ---------------------------------------------------------------------------
// Herkese açık (oturumsuz) — apiRequest bilinçli olarak KULLANILMAZ: çerez gönderilmez ve hiçbir yanıtta panel girişine
// yönlendirilmez (features/surveys/api.ts ile aynı model). Uçlar asla 401 dönmez (404 / 400 / 422 / 429).
// ---------------------------------------------------------------------------

async function publicRequest<T>(path: string, init: { method: "GET" | "POST"; body?: unknown }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method,
      credentials: "omit",
      cache: "no-store",
      headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError("Network error", 0);
  }
  const data: unknown = await res.json().catch(() => null);
  if (res.ok) return data as T;
  const code = (data as Partial<ApiErrorBody> | null)?.error?.code;
  const known = isApiErrorCode(code) ? code : null;
  throw new ApiError(known ?? `HTTP ${res.status}`, res.status, known);
}

const publicBase = (token: string) => `/api/public/tickets/${encodeURIComponent(token)}`;

export const fetchPublicTicketPage = (token: string) => publicRequest<PublicTicketPage>(publicBase(token), { method: "GET" });

export const submitPublicTicket = (token: string, body: PublicTicketInput) =>
  publicRequest<{ number: number }>(publicBase(token), { method: "POST", body });
