/**
 * Faturalar (DeepSport madde 9 · INVOICES). Edoras'ta satış = 1 yıllık lisans (crm_licenses) ya da ödeme
 * (crm_payments); ürün kataloğu ve kanal yoktur, satışı yapan kayıt açan personeldir.
 *
 * Yöntemler (InvoiceProvider arayüzü):
 *  - PROVIDER: fatura bir platformda (ilk sağlayıcı Paraşüt) kesilir. Henüz bağlı değil (anahtar yok).
 *  - EMAIL: fatura talebi e-postayla muhasebeciye (ve istenirse müşteriye) gider; muhasebeci keser.
 *  - MANUAL: fatura başka yerde kesildi; personel numara + tarihle kaydeder (Edoras'a özgü).
 */
import type { PaymentMethod } from "@/lib/domain/institutions/types";

export type InvoiceMode = "PROVIDER" | "EMAIL" | "MANUAL";
export type InvoiceProviderCode = "PARASUT" | "LOGO" | "OTHER";
export type InvoiceStatus = "PENDING" | "ISSUED" | "SENT" | "FAILED" | "CANCELLED";
export type EInvoiceType = "E_FATURA" | "E_ARSIV";

export const INVOICE_MODES = ["PROVIDER", "EMAIL", "MANUAL"] as const;
export const INVOICE_PROVIDER_CODES = ["PARASUT", "LOGO", "OTHER"] as const;
export const INVOICE_STATUSES = ["PENDING", "ISSUED", "SENT", "FAILED", "CANCELLED"] as const;

export interface InvoiceProviderInfo {
  code: InvoiceProviderCode;
  name: string;
  /** API anahtarları sunucuda tanımlı mı. */
  configured: boolean;
}

/** "Fatura kes" penceresinin sunucudan öğrendiği: sağlayıcılar ve e-posta yönteminin açık olup olmadığı. */
export interface InvoiceOptions {
  providers: InvoiceProviderInfo[];
  /** E-posta yöntemi: Resend (RESEND_API_KEY + EMAIL_FROM) ve muhasebeci adresi (ACCOUNTANT_EMAIL) tanımlı mı. */
  emailAvailable: boolean;
}

export interface Invoice {
  id: string;
  institutionId: string;
  paymentId: string | null;
  licenseId: string | null;
  /** Fatura anındaki müşteri (unvan ya da kurum adı). */
  customerName: string;
  mode: InvoiceMode;
  provider: InvoiceProviderCode | null;
  type: EInvoiceType | null;
  recipientEmails: string[];
  /** KDV dahil toplam (TRY). */
  amount: number;
  netAmount: number;
  vatRate: number;
  vatAmount: number;
  currency: "TRY";
  description: string;
  /** YYYY-MM-DD. */
  issueDate: string;
  status: InvoiceStatus;
  invoiceNo: string | null;
  pdfUrl: string | null;
  /** Kısa hata kodu (ör. "resend:422"); sağlayıcı mesajı ve alıcı adresi tutulmaz. */
  error: string | null;
  attempts: number;
  note: string | null;
  createdAt: string;
  issuedAt: string | null;
  /** Kaydı açan personel (created_by → crm_staff.full_name). */
  createdByName: string | null;
}

export interface InvoiceList {
  items: Invoice[];
  total: number;
  page: number;
  size: number;
  /** Durum filtresi hariç diğer filtrelerle eşleşen faturaların durum başına sayısı (sekme rozetleri). */
  counts: Record<InvoiceStatus, number>;
}

export interface InvoiceListFilters {
  status?: InvoiceStatus | "";
  institutionId?: string;
  /** Fatura tarihi aralığı (YYYY-MM-DD, uçlar dahil). */
  from?: string;
  to?: string;
  /** "payment:<id>" ya da "license:<id>": aynı satışın faturaları (çift fatura uyarısı). */
  saleRef?: string;
  page?: number;
  size?: number;
}

/** Ödeme Geçmişi satırı (tüm kurumların crm_payments kayıtları). */
export interface SalePayment {
  id: string;
  institutionId: string;
  institutionName: string;
  licenseId: string | null;
  amount: number;
  paidOn: string;
  method: PaymentMethod;
  note: string | null;
  createdAt: string;
  /** Kaydı açan personel. */
  sellerName: string | null;
  /** Bu ödemeye bağlı en son fatura (yoksa null). */
  invoice: { id: string; status: InvoiceStatus } | null;
}

export interface SalePaymentList {
  items: SalePayment[];
  total: number;
  /** Filtreyle eşleşen TÜM kayıtların toplamı (yalnız bu sayfanınki değil). */
  totalAmount: number;
  page: number;
  size: number;
}

export interface SalePaymentFilters {
  from?: string;
  to?: string;
  method?: PaymentMethod | "";
  institutionId?: string;
  query?: string;
  page?: number;
  size?: number;
}
