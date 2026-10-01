import { HttpError, ok, parseBody, requireStaff, route } from "@/lib/api/server";
import { createInvoiceSchema, invoiceListQuerySchema } from "@/lib/domain/invoices/schemas";
import { createInvoice, listInvoices } from "@/lib/server/invoices";

export const dynamic = "force-dynamic";
/** Platform faturası (Paraşüt) resmileştirme işini bekler: en çok ~30 sn. */
export const maxDuration = 60;

/**
 * Faturalar. Süzgeç: status, institutionId, from, to (fatura tarihi), saleRef (`payment:<id>` / `license:<id>` — aynı
 * satışın faturaları, çift fatura uyarısı); sayfalama: page, size. Yalnız ADMIN (finansal): CRM_AGENT 403.
 */
export const GET = route(async (request: Request) => {
  await requireStaff({ role: "ADMIN" });
  const params = Object.fromEntries(new URL(request.url).searchParams);
  return ok(await listInvoices(invoiceListQuerySchema.parse(params)));
});

/**
 * Fatura kes / talep et / kaydet (yalnız ADMIN). `Idempotency-Key` başlığı (yoksa gövdedeki `idempotencyKey`) zorunlu:
 * aynı anahtarla tekrar gelen istek yeni satır açmaz, var olan faturayı döndürür (200). Yeni fatura 201.
 * 503 MAIL_NOT_CONFIGURED: EMAIL yöntemi için Resend ya da ACCOUNTANT_EMAIL yok; 503 PROVIDER_NOT_CONFIGURED: sağlayıcı
 * anahtarı yok; 422 BILLING_REQUIRED / BILLING_PROFILE_INCOMPLETE: kurumun fatura bilgisi eksik.
 */
export const POST = route(async (request: Request) => {
  const staff = await requireStaff({ role: "ADMIN" });
  const body = await parseBody(request, createInvoiceSchema);
  const key = request.headers.get("idempotency-key")?.trim() || body.idempotencyKey;
  if (!key || key.length < 8 || key.length > 200) {
    throw new HttpError(400, "VALIDATION", { idempotencyKey: "Idempotency-Key başlığı zorunlu (8–200 karakter)" });
  }
  const { invoice, replayed } = await createInvoice(body, key, staff);
  return ok(invoice, replayed ? 200 : 201);
});
