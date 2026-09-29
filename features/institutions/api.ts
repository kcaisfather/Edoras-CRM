import { apiRequest } from "@/lib/api/client";
import type {
  BillingInput,
  ContactInput,
  ConvertInput,
  EnrollInput,
  NewDemoInput,
  PaymentInput,
  RenewInput,
} from "@/lib/domain/institutions/schemas";
import type { DemoCredentials, InstitutionDetail, InstitutionListItem } from "@/lib/domain/institutions/types";

const base = (id: string) => `/api/institutions/${encodeURIComponent(id)}`;

export const institutionsApi = {
  list: (signal?: AbortSignal) => apiRequest<InstitutionListItem[]>("/api/institutions", { signal }),
  get: (id: string, signal?: AbortSignal) => apiRequest<InstitutionDetail>(base(id), { signal }),
  createDemo: (input: NewDemoInput) =>
    apiRequest<DemoCredentials>("/api/institutions", { method: "POST", body: input }),
  enroll: (id: string, input: EnrollInput) => apiRequest(`${base(id)}/enroll`, { method: "POST", body: input }),
  convert: (id: string, input: ConvertInput) => apiRequest(`${base(id)}/convert`, { method: "POST", body: input }),
  renew: (id: string, input: RenewInput) => apiRequest(`${base(id)}/licenses`, { method: "POST", body: input }),
  updateContact: (id: string, input: ContactInput) =>
    apiRequest(`${base(id)}/contact`, { method: "PATCH", body: input }),
  updateBilling: (id: string, input: BillingInput) =>
    apiRequest(`${base(id)}/billing`, { method: "PATCH", body: input }),
  recordPayment: (id: string, input: PaymentInput) =>
    apiRequest(`${base(id)}/payments`, { method: "POST", body: input }),
};
