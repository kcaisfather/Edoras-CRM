import type { UseFormReturn } from "react-hook-form";
import { ApiError } from "@/lib/api/client";
import type { LeadFormValues } from "@/lib/domain/crm/form";

/** API alan adı → form alan adı (sunucunun 400 VALIDATION alan mesajları forma işlenir). */
const API_TO_FORM: Record<string, keyof LeadFormValues> = {
  organizationName: "organizationName",
  contactFirstName: "firstName",
  contactLastName: "lastName",
  contactEmail: "email",
  contactPhone: "phone",
  whatsappUsername: "whatsapp",
  city: "city",
  district: "district",
  country: "country",
  nextFollowUpAt: "nextCall",
  offerAmount: "offerAmount",
  saleAmount: "saleAmount",
};

/** Sunucu alan hatalarını forma yazar; yazıldıysa true (aday ekleme ve aday paneli ortak). */
export function applyLeadFieldErrors(form: UseFormReturn<LeadFormValues>, err: unknown): boolean {
  if (!(err instanceof ApiError) || !err.fields) return false;
  let applied = false;
  for (const [key, message] of Object.entries(err.fields)) {
    const field = API_TO_FORM[key];
    if (field) {
      form.setError(field, { type: "server", message });
      applied = true;
    }
  }
  return applied;
}
