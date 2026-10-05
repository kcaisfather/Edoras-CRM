/**
 * Teklif ve satış kuralları (kurucu, 2026-10-05): "Teklif verildiyse fiyat girilmek zorunda; satış yapıldıysa fiyat ve
 * firma bilgileri girilmek zorunda; satış yapıldıysa direkt hesabı açmalı."
 *
 * - Teklif verildi: teklif tutarı > 0 (satır içi pencere, ekleme formu, aday paneli, sunucu, veritabanı).
 * - Satış oldu: yalnız satış penceresinden (POST /api/crm/leads/{id}/sale): satış tutarı > 0 + tam fatura profili; aynı
 *   işlemde hesap açılır — aday bağlı değilse Edoras'ta yeni kurum (ücretli, satış tutarıyla 1 yıllık lisans), DEMO
 *   kurumsa ücretliye geçiş, CRM kaydı olmayan kurumsa ücretli kayda alma. Veritabanı kuralı:
 *   supabase/migrations/20261005170000_crm_lead_sale_rules.sql.
 * Formlar ve sunucu aynı şemayı kullanır (tek kaynak). Saf — testler sale.test.ts'te.
 */
import { z } from "zod";
import { parseAmount } from "@/lib/utils/money";
import {
  billingProfileFormValues,
  billingShape,
  checkBilling,
  checkProfile,
  newDemoSchema,
  profileShape,
  type NewDemoInput,
} from "@/lib/domain/institutions/schemas";
import type { BillingProfile, DemoCredentials } from "@/lib/domain/institutions/types";
import type { CrmLead, CrmLeadDto, CrmStatus } from "./types";

export const MSG = {
  offerAmountRequired: "Teklif verildi için teklif tutarı zorunlu (0'dan büyük)",
  saleAmountRequired: "Satış için satış tutarı zorunlu (0'dan büyük)",
  amountInvalid: "Geçerli bir tutar girin (ör. 45.000)",
} as const;

/** numeric(12, 2) üst sınırı. */
const MAX_AMOUNT = 9_999_999_999.99;

/** Tutar metni > 0 mı (Türkçe yazım). */
export function positiveAmount(text: string | null | undefined): number | null {
  const n = parseAmount(text ?? "");
  return n !== null && n > 0 && n <= MAX_AMOUNT ? n : null;
}

/** Statünün zorunlu tutarı: Teklif verildi → teklif, Satış oldu → satış. */
export function requiredAmountField(status: CrmStatus | null | undefined): "offerAmount" | "saleAmount" | null {
  if (status === "TEKLIF_VERILDI") return "offerAmount";
  if (status === "SATIS_OLDU") return "saleAmount";
  return null;
}

/**
 * Satışta hesap: NEW = Edoras'ta yeni kurum açılır (kurum adı, program, yetkili); ENROLL = bağlı kurumun CRM kaydı yok,
 * ücretli kayda alınır (yetkili); CONVERT = DEMO → ücretli; PAID = zaten ücretli (yalnız fatura profili + satış).
 */
export type SaleAccountMode = "NEW" | "ENROLL" | "CONVERT" | "PAID";

export function saleAccountMode(lead: Pick<CrmLead, "institutionId" | "institution">): SaleAccountMode {
  if (!lead.institutionId) return "NEW";
  const status = lead.institution?.crm?.status;
  if (status === "UCRETLI") return "PAID";
  if (status === "DEMO") return "CONVERT";
  return "ENROLL";
}

/** Hangi hesap alanları gerekir: NEW → kurum adı + program + yetkili, ENROLL → yetkili, diğerleri → yok. */
export const ACCOUNT_FIELDS: Record<SaleAccountMode, readonly (keyof LeadSaleInput)[]> = {
  NEW: ["institutionName", "program", "contactName", "contactPhone", "contactEmail"],
  ENROLL: ["contactName", "contactPhone", "contactEmail"],
  CONVERT: [],
  PAID: [],
};

/**
 * Satış penceresi + POST /api/crm/leads/{id}/sale gövdesi. Değerler form gibi metindir. `account` istemcinin gördüğü
 * hesap durumudur; sunucu adayın gerçek durumuna göre karar verir ve eksik hesap alanını 400 VALIDATION ile döndürür.
 */
export const leadSaleSchema = z
  .object({
    saleAmount: z.string(),
    ...billingShape,
    ...profileShape,
    account: z.enum(["NEW", "ENROLL", "CONVERT", "PAID"]),
    institutionName: z.string(),
    program: z.enum(["yks", "lgs"]),
    contactName: z.string(),
    contactPhone: z.string(),
    contactEmail: z.string(),
  })
  .superRefine((v, ctx) => {
    if (positiveAmount(v.saleAmount) === null) {
      ctx.addIssue({ code: "custom", path: ["saleAmount"], message: v.saleAmount.trim() && parseAmount(v.saleAmount) === null ? MSG.amountInvalid : MSG.saleAmountRequired });
    }
    checkBilling(v, ctx);
    checkProfile(v, ctx);
    for (const issue of accountIssues(v, v.account)) ctx.addIssue({ code: "custom", ...issue });
  });
export type LeadSaleInput = z.input<typeof leadSaleSchema>;

/** Hesap alanlarının doğrulaması (demo açmayla aynı kurallar: newDemoSchema). */
export function accountIssues(v: LeadSaleInput, mode: SaleAccountMode): { path: string[]; message: string }[] {
  const fields = ACCOUNT_FIELDS[mode];
  if (fields.length === 0) return [];
  const res = newDemoSchema.safeParse({
    institutionName: mode === "NEW" ? v.institutionName : "Kayıtlı kurum",
    program: v.program,
    contactName: v.contactName,
    contactPhone: v.contactPhone,
    contactEmail: v.contactEmail,
  });
  if (res.success) return [];
  return res.error.issues
    .filter((i) => fields.includes(i.path[0] as keyof LeadSaleInput))
    .map((i) => ({ path: [String(i.path[0])], message: i.message }));
}

/** Yeni hesabın (Edoras kurumu + kurum yöneticisi) girdisi. */
export function toSaleAccount(v: LeadSaleInput): NewDemoInput {
  return {
    institutionName: v.institutionName,
    program: v.program,
    contactName: v.contactName,
    contactPhone: v.contactPhone,
    contactEmail: v.contactEmail,
  };
}

/** Kayıtlı kurumu ücretli kayda alırken yetkili bilgisi. */
export function toSaleContact(v: LeadSaleInput): Pick<NewDemoInput, "contactName" | "contactPhone" | "contactEmail"> {
  return { contactName: v.contactName, contactPhone: v.contactPhone, contactEmail: v.contactEmail };
}

/** "+905321234567" → "0532 123 45 67". */
function phoneToInput(e164: string | null | undefined): string {
  if (!e164) return "";
  const m = /^\+90(\d{3})(\d{3})(\d{2})(\d{2})$/.exec(e164);
  return m ? `0${m[1]} ${m[2]} ${m[3]} ${m[4]}` : e164;
}

/**
 * Satış penceresinin başlangıç değerleri: tutar = kayıttaki satış ya da teklif tutarı; fatura profili kayıtlıysa o,
 * yoksa unvan = kurum adı (yoksa yetkili), fatura e-postası = adayın e-postası; yeni hesap alanları adaydan.
 */
export function leadSaleFormValues(lead: CrmLead, billing: BillingProfile | null = null): LeadSaleInput {
  const contactName = [lead.contactFirstName, lead.contactLastName].filter(Boolean).join(" ").trim();
  const amount = lead.saleAmount ?? lead.offerAmount;
  return {
    saleAmount: amount != null && amount > 0 ? String(amount).replace(".", ",") : "",
    ...billingProfileFormValues(billing, {
      legalName: lead.organizationName || lead.institution?.name || contactName || "",
      email: lead.contactEmail ?? lead.institution?.crm?.contactEmail ?? "",
    }),
    account: saleAccountMode(lead),
    institutionName: lead.organizationName ?? "",
    program: "yks",
    contactName: contactName || lead.institution?.crm?.contactName || "",
    contactPhone: phoneToInput(lead.contactPhone ?? lead.institution?.crm?.contactPhone),
    contactEmail: lead.contactEmail ?? lead.institution?.crm?.contactEmail ?? "",
  };
}

/** Satış ucunun yanıtı: güncel aday + (yeni hesap açıldıysa) kurum yöneticisinin giriş bilgisi (şifre bir kez). */
export interface LeadSaleResult {
  lead: CrmLeadDto;
  /** Yeni Edoras kurumu açıldıysa; `demoEndsAt` burada lisans bitişidir. */
  credentials: DemoCredentials | null;
  mode: SaleAccountMode;
}
