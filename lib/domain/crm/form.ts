/**
 * Aday ekleme / düzenleme formunun değerleri ve API gövdesine çevirisi (saf; testli). Form değerleri
 * metindir; tutarlar Türkçe yazımla girilir ("12.500", "12.500,50"). EK-2: boş tutar 0 TL'dir ama
 * dokunulmamış boş alan gönderilmez (her kayıtta null → 0 kirlenmesi olmasın).
 */
import { z } from "zod";
import { canonicalLocation, withLocationDefaults } from "@/lib/data/tr-locations";
import { normalizeTrPhone } from "@/lib/utils/phone";
import { parseAmount } from "@/lib/utils/money";
import { COMPETITOR_NAME_MAX, LOST_NOTE_MAX } from "./loss-detail";
import { FOLLOW_UP_STATUSES } from "./offer";
import type { LeadCreateInput, LeadPatchInput } from "./schemas";
import { CRM_STATUSES, isLostReason, type CrmLead, type CrmStatus } from "./types";
import { amountForSave, amountToInput } from "./utils";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const leadFormSchema = z
  .object({
    organizationName: z.string().max(200, "Çok uzun"),
    firstName: z.string().max(100, "Çok uzun"),
    lastName: z.string().max(100, "Çok uzun"),
    phone: z.string().refine((v) => !v.trim() || normalizeTrPhone(v) !== null, "Geçerli bir telefon girin (05XX XXX XX XX)"),
    email: z.string().refine((v) => !v.trim() || EMAIL.test(v.trim()), "Geçerli bir e-posta adresi girin"),
    city: z.string().max(100, "Çok uzun"),
    district: z.string().max(100, "Çok uzun"),
    country: z.string().max(100, "Çok uzun"),
    status: z.enum(CRM_STATUSES),
    nextCall: z.string(),
    lostReason: z.string(),
    /** Kayıp ayrıntısı (yalnız "Satış olmadı"): kayıp notu, rakip adı, yeniden temas günü (YYYY-MM-DD). */
    lostNote: z.string().max(LOST_NOTE_MAX, "Çok uzun"),
    competitor: z.string().max(COMPETITOR_NAME_MAX, "Çok uzun"),
    recallAt: z.string(),
    offerAmount: z.string().refine((v) => !v.trim() || parseAmount(v) !== null, "Geçerli bir tutar girin (ör. 45.000)"),
    saleAmount: z.string().refine((v) => !v.trim() || parseAmount(v) !== null, "Geçerli bir tutar girin (ör. 45.000)"),
  })
  .refine((v) => !!(v.organizationName.trim() || v.firstName.trim() || v.lastName.trim()), {
    path: ["organizationName"],
    message: "Kurum adı ya da yetkilinin adı zorunlu",
  });

export type LeadFormValues = z.infer<typeof leadFormSchema>;

export function emptyLeadForm(status: CrmStatus = "ARANACAK"): LeadFormValues {
  // Yeni aday: Ülke = Türkiye, İl = İstanbul (listeden değiştirilir).
  return withLocationDefaults({
    organizationName: "",
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    city: "",
    district: "",
    country: "",
    status,
    nextCall: "",
    lostReason: "",
    lostNote: "",
    competitor: "",
    recallAt: "",
    offerAmount: "",
    saleAmount: "",
  });
}

/** "+905321234567" → "0532 123 45 67" (formda okunur; kaydederken yine E.164'e çevrilir). */
function phoneToInput(e164: string | null | undefined): string {
  if (!e164) return "";
  const m = /^\+90(\d{3})(\d{3})(\d{2})(\d{2})$/.exec(e164);
  return m ? `0${m[1]} ${m[2]} ${m[3]} ${m[4]}` : e164;
}

export function leadToForm(lead: CrmLead): LeadFormValues {
  return {
    organizationName: lead.organizationName ?? "",
    firstName: lead.contactFirstName ?? "",
    lastName: lead.contactLastName ?? "",
    phone: phoneToInput(lead.contactPhone),
    email: lead.contactEmail ?? "",
    ...canonicalLocation({ city: lead.city, district: lead.district, country: lead.country }),
    status: lead.status ?? "ARANACAK",
    nextCall: lead.nextFollowUpAt ?? "",
    lostReason: lead.lostReason ?? "",
    lostNote: lead.lostNote ?? "",
    competitor: lead.competitor ?? "",
    recallAt: lead.recallAt ?? "",
    offerAmount: amountToInput(lead.offerAmount),
    saleAmount: amountToInput(lead.saleAmount),
  };
}

function followUpBody(v: LeadFormValues) {
  const tracked = FOLLOW_UP_STATUSES.includes(v.status);
  const lost = v.status === "OLUMSUZ";
  const lostReason = lost && isLostReason(v.lostReason) ? v.lostReason : null;
  return {
    status: v.status,
    nextFollowUpAt: tracked && v.nextCall ? v.nextCall : null,
    lostReason,
    // Kayıp ayrıntısı yalnız "Satış olmadı"da; rakip adı yalnız neden "Rakip tercih edildi" iken. Boş = temizle.
    lostNote: lost ? v.lostNote.trim() || null : null,
    competitor: lostReason === "COMPETITOR" ? v.competitor.trim() || null : null,
    recallAt: lost && v.recallAt ? v.recallAt : null,
  };
}

function contactBody(v: LeadFormValues) {
  return {
    organizationName: v.organizationName,
    contactFirstName: v.firstName,
    contactLastName: v.lastName,
    contactEmail: v.email,
    contactPhone: v.phone,
    city: v.city,
    district: v.district,
    country: v.country,
  };
}

/**
 * Tutarlar yalnız finans yetkisiyle gönderilir (CRM_AGENT göndermez; sunucu da yok sayar). Boş alan:
 * kayıtta tutar yoksa gönderilmez; satışa / teklife geçerken ya da mevcut tutar silinirse 0 TL.
 */
function amountBody(v: LeadFormValues, original: Pick<CrmLead, "offerAmount" | "saleAmount">, financial: boolean) {
  if (!financial) return {};
  const offer = amountForSave(v.offerAmount, original.offerAmount, v.status === "TEKLIF_VERILDI");
  const sale = amountForSave(v.saleAmount, original.saleAmount, v.status === "SATIS_OLDU");
  return { ...(offer !== undefined ? { offerAmount: offer } : {}), ...(sale !== undefined ? { saleAmount: sale } : {}) };
}

export function formToCreate(v: LeadFormValues, financial: boolean): LeadCreateInput {
  return { ...contactBody(v), ...followUpBody(v), ...amountBody(v, {}, financial), source: "MANUAL" };
}

export function formToPatch(v: LeadFormValues, lead: CrmLead, financial: boolean): LeadPatchInput {
  return { ...contactBody(v), ...followUpBody(v), ...amountBody(v, lead, financial) };
}
