import { institutionStatus, type InstitutionStatusInfo } from "@/lib/domain/institutions/status";
import type { GrowthCustomer } from "./types";

/**
 * Müşterinin ekrandaki durumu (lib/domain/institutions/status.ts ile aynı kural). Yalnız durum ve gün hesabı için gereken
 * alanlar taşınır; CRM kaydının iletişim/fatura alanları burada anlamsızdır.
 */
export function customerStatusInfo(c: Pick<GrowthCustomer, "isActive" | "status" | "demoEndsAt" | "licenseEndsOn">, today: string): InstitutionStatusInfo {
  return institutionStatus(
    {
      isActive: c.isActive,
      licenseEndsOn: c.licenseEndsOn,
      crm: c.status
        ? {
            status: c.status,
            contactName: "",
            contactPhone: "",
            contactEmail: "",
            demoStartedAt: null,
            demoEndsAt: c.demoEndsAt,
            convertedAt: null,
            billingComplete: false,
            billingProfileComplete: false,
          }
        : null,
    },
    today
  );
}
