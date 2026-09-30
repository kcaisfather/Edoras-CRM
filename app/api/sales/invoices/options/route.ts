import { ok, requireStaff, route } from "@/lib/api/server";
import { getInvoiceOptions } from "@/lib/server/invoices";

export const dynamic = "force-dynamic";

/** "Fatura kes" penceresi için: sağlayıcılar + e-posta yöntemi açık mı (Resend ve ACCOUNTANT_EMAIL). Yalnız ADMIN. */
export const GET = route(async () => {
  await requireStaff({ role: "ADMIN" });
  return ok(getInvoiceOptions());
});
