/**
 * invoices (madde 9) — diğer ekranların kullanacağı yüzey.
 * - <InvoiceDialog target open onOpenChange /> : "Fatura kes" (E-posta talebi / Elle kayıt / Platform); kurumun lisans, ödeme
 *   ve fatura bilgisini kendisi okur.
 * - <PaymentInvoiceAction institutionId paymentId licenseId /> : kurum ödeme satırında fatura durumu + "Fatura kes"
 * - <InvoicesPage /> : /sales/invoices
 * Fatura bilgileri (profil) kurumlar modülündedir (kurum ayrıntısı → "Fatura bilgileri").
 */
export { InvoiceDialog, type InvoiceTarget } from "./components/InvoiceDialog";
export { InvoicesPage } from "./components/InvoicesPage";
export { PaymentInvoiceAction } from "./components/PaymentInvoiceAction";
export { invoiceKeys, useInvoiceOptions, useInvoices } from "./queries";
