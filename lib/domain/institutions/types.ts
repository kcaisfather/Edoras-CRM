/** Kurum CRM alan tipleri — API yanıtları ve ekranlar bu şekilleri paylaşır. */

export type CrmStatus = "DEMO" | "UCRETLI";
export type InstitutionProgram = "yks" | "lgs";

export const PAYMENT_METHODS = ["HAVALE", "KREDI_KARTI", "NAKIT", "DIGER"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface CrmRecord {
  status: CrmStatus;
  contactName: string;
  /** E.164 (+905XXXXXXXXX). */
  contactPhone: string;
  contactEmail: string;
  demoStartedAt: string | null;
  demoEndsAt: string | null;
  convertedAt: string | null;
  /** Adres + (TC veya Vergi No) kayıtlı mı. Ayrıntıyı görmeyen rol de bunu görür. */
  billingComplete: boolean;
  /**
   * Fatura profili tam mı (unvan, il/ilçe, fatura e-postası, vergi dairesi…): fatura talebi için gerekir.
   * `billingComplete`'ten katı; ayrıntıyı görmeyen rol de yalnız bu bilgiyi görür.
   */
  billingProfileComplete: boolean;
}

export interface InstitutionListItem {
  id: string;
  name: string;
  /** Edoras'ta kurum yoksa (silinmiş) bilinmez: null. */
  program: InstitutionProgram | null;
  isActive: boolean;
  /** CRM kaydı var ama kurum Edoras'ta bulunamadı (silinmiş). Ad, CRM'deki kayıt anı adıdır. */
  missingInEdoras: boolean;
  /** İç / sunum kurumu (Ayarlar → Veri kalitesi): metriklerden hariç, listede "İç" etiketiyle. */
  isInternal: boolean;
  createdAt: string | null;
  /** CRM kaydı yoksa null ("Kayıtsız": CRM öncesinden kalan kurum). */
  crm: CrmRecord | null;
  /** Lisansın bitişi (CRM lisanslarının en geçi). */
  licenseEndsOn: string | null;
}

export interface Billing {
  address: string | null;
  tcNo: string | null;
  taxNo: string | null;
}

/** DeepSport BillingProfile karşılığı: INDIVIDUAL → TC Kimlik No, COMPANY → Vergi No + vergi dairesi. */
export type BillingType = "INDIVIDUAL" | "COMPANY";

/**
 * Kurumun fatura profili = adres + kimlik (`Billing`) + genişletilmiş alanlar. Eski kayıtlarda `billingType` null'dır
 * (adres + TC/VKN geçerli, profil tamamlanmamış); ekran türü TC/VKN'den çıkarır (`effectiveBillingType`).
 */
export interface BillingProfile extends Billing {
  billingType: BillingType | null;
  /** Şirket unvanı ya da bireyselde ad soyad. */
  legalName: string | null;
  taxOffice: string | null;
  city: string | null;
  district: string | null;
  postalCode: string | null;
  /** Faturanın gideceği e-posta. */
  email: string | null;
  /** GİB e-Fatura mükellefi mi; yalnız sağlayıcı entegrasyonu doldurur (panel yazmaz), null = bilinmiyor. */
  eInvoiceRegistered: boolean | null;
}

export interface License {
  id: string;
  startsOn: string;
  endsOn: string;
  /** Finansal yetkisi olmayan rol için null. */
  price: number | null;
  note: string | null;
  createdAt: string;
}

export interface Payment {
  id: string;
  licenseId: string | null;
  amount: number;
  paidOn: string;
  method: PaymentMethod;
  note: string | null;
  createdAt: string;
}

export interface InstitutionAdmin {
  userId: string;
  fullName: string | null;
  email: string | null;
  isActive: boolean;
}

export interface InstitutionUsage {
  students: number;
  teachers: number;
  classes: number;
}

export interface InstitutionDetail extends InstitutionListItem {
  /** Finansal yetkisi olmayan rol için null (TC, Vergi No ve adres gösterilmez). */
  billing: BillingProfile | null;
  licenses: License[];
  /** Finansal yetkisi olmayan rol için null. */
  payments: Payment[] | null;
  admins: InstitutionAdmin[];
  usage: InstitutionUsage;
}

/** Demo açılınca bir kez gösterilen giriş bilgisi (şifre başka yerde saklanmaz). */
export interface DemoCredentials {
  institutionId: string;
  loginEmail: string;
  temporaryPassword: string;
  demoEndsAt: string;
  panelUrl: string;
}
