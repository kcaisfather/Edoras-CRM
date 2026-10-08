import { apiRequest } from "@/lib/api/client";
import type {
  BillingInput,
  ContactInput,
  ConvertInput,
  EnrollInput,
  LicenseEditInput,
  LicenseListPriceInput,
  NewDemoInput,
  PaymentInput,
  RenewInput,
} from "@/lib/domain/institutions/schemas";
import type { PanelModuleState, PanelModuleToggleInput } from "@/lib/domain/institutions/panel-modules";
import type { DemoCredentials, InstitutionDetail, InstitutionListItem, LicensePricingSettings } from "@/lib/domain/institutions/types";

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
  updateLicense: (id: string, licenseId: string, input: LicenseEditInput) =>
    apiRequest(`${base(id)}/licenses/${encodeURIComponent(licenseId)}`, { method: "PATCH", body: input }),
  updatePayment: (id: string, paymentId: string, input: PaymentInput) =>
    apiRequest(`${base(id)}/payments/${encodeURIComponent(paymentId)}`, { method: "PATCH", body: input }),
  deletePayment: (id: string, paymentId: string) =>
    apiRequest(`${base(id)}/payments/${encodeURIComponent(paymentId)}`, { method: "DELETE" }),
  panelModules: (id: string, signal?: AbortSignal) => apiRequest<PanelModuleState[]>(`${base(id)}/modules`, { signal }),
  setPanelModule: (id: string, input: PanelModuleToggleInput) =>
    apiRequest<PanelModuleState[]>(`${base(id)}/modules`, { method: "PATCH", body: input }),
  licensePricing: (signal?: AbortSignal) => apiRequest<LicensePricingSettings>("/api/settings/license-pricing", { signal }),
  updateLicensePricing: (input: LicenseListPriceInput) =>
    apiRequest<LicensePricingSettings>("/api/settings/license-pricing", { method: "PUT", body: input }),
};
