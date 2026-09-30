import { ok, requireStaff, route } from "@/lib/api/server";
import { getInvoiceOptions } from "@/lib/server/invoices";

export const dynamic = "force-dynamic";

/** Fatura sağlayıcıları ve anahtarlarının tanımlı olup olmadığı (DeepSport InvoiceProviderInfo[]). Yalnız ADMIN. */
export const GET = route(async () => {
  await requireStaff({ role: "ADMIN" });
  return ok(getInvoiceOptions().providers);
});
