/**
 * Aday yardımcıları (DeepSportAdmin lib/domain/crm/utils.ts'ten): tutar girişi, biçimlendirme,
 * başlık ve statü renkleri. Saf fonksiyonlar.
 */
import { parseAmount } from "@/lib/utils/money";
import type { CrmLead } from "./types";

/**
 * Tutar alanı → sayı; boş ya da okunamayan → 0 TL (EK-2: ürün liste fiyatı hiçbir zaman varsayılan olmaz).
 * "12.500", "12.500,50", "12500.5" gibi Türkçe yazımlar okunur.
 */
export function amountFromInput(v: string | null | undefined): number {
  return parseAmount((v ?? "").trim()) ?? 0;
}

/**
 * Düzenleme formunda tutar: dolu → girilen değer; boş → kayıtta tutar varsa ya da `zeroIfEmpty` (satışa/teklife
 * geçiş) ise 0 TL, aksi hâlde `undefined` (alana dokunulmaz).
 */
export function amountForSave(
  input: string | null | undefined,
  original: number | null | undefined,
  zeroIfEmpty = false
): number | undefined {
  if ((input ?? "").trim()) return amountFromInput(input);
  return original != null || zeroIfEmpty ? 0 : undefined;
}

/** Tutar alanının form değeri (TR biçiminde, kuruş varsa virgüllü). */
export function amountToInput(amount: number | null | undefined): string {
  if (amount == null) return "";
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2, useGrouping: false }).format(amount);
}

const DATE = new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });

/** Epoch ms ya da YYYY-MM-DD → "29.09.2026"; boşsa "-". Takvim günü UTC'de okunmaz (kayma olmasın). */
export function formatCrmDate(value: number | string | null | undefined): string {
  if (value == null || value === "") return "-";
  let date: Date;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    date = new Date(y, m - 1, d);
  } else {
    date = new Date(value);
  }
  return Number.isNaN(date.getTime()) ? "-" : DATE.format(date);
}

export function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return "-";
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Kalan bakiye: max(0, satış − tahsilat). */
export function getRemainingAmount(saleAmount: number | null | undefined, collectedAmount: number | null | undefined): number {
  return Math.max(0, (saleAmount ?? 0) - (collectedAmount ?? 0));
}

export function getContactName(lead: Pick<CrmLead, "contactFirstName" | "contactLastName">): string {
  return [lead.contactFirstName, lead.contactLastName].filter(Boolean).join(" ").trim();
}

export function getLeadDisplayName(lead: CrmLead): string {
  const name = getContactName(lead);
  if (name) return name;
  if (lead.organizationName) return lead.organizationName;
  if (lead.contactEmail) return lead.contactEmail;
  return "-";
}

/** Kurum adı anlamlı mı ("", "-", "...", "…" gibi yer tutucular değil). */
function meaningfulOrg(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  return v && !/^[\s.\-–—…_·]*$/.test(v) ? v : null;
}

/**
 * Satır başlığı + alt satır: kurum adı varsa başlık kurum, alt satır kişi; yoksa başlık kişi adı
 * (asla "-" / "..." değil), alt satır boş.
 */
export function getLeadTitle(lead: CrmLead): { title: string; subtitle: string | null } {
  const org = meaningfulOrg(lead.organizationName);
  const person = getContactName(lead);
  if (org) return { title: org, subtitle: person && person !== org ? person : null };
  const title = person || lead.contactEmail || lead.contactPhone || "-";
  return { title, subtitle: null };
}

/** "Ad Soyad" → { ad, soyad } (son kelime soyad). Kurum yetkilisinden aday oluştururken. */
export function splitFullName(fullName: string | null | undefined): { firstName: string; lastName: string } {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { firstName: parts[0] ?? "", lastName: "" };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] };
}

/** Aşama rengi noktası (statü şeridi) — rozetle aynı renk ailesi. */
export function getCrmStatusDotClass(status: string | null | undefined): string {
  switch (status) {
    case "SATIS_OLDU":
      return "bg-success";
    case "DEMO_TANIMLANDI":
      return "bg-primary";
    case "TEKLIF_VERILDI":
      return "bg-category-7";
    case "TAKIPTE":
      return "bg-primary";
    case "RANDEVU_PLANLANDI":
      return "bg-warning";
    case "OLUMSUZ":
      return "bg-destructive";
    case "ULASILAMADI":
      return "bg-caution";
    default:
      return "bg-muted-foreground/60";
  }
}

/** Satış aşaması rozeti — tablo ve mobil kartta aynı renkler, iki temada da okunur. */
export function getCrmStatusBadgeClass(status: string | null | undefined): string {
  switch (status) {
    case "SATIS_OLDU":
      return "bg-success/10 text-success border-success/25";
    case "DEMO_TANIMLANDI":
      return "bg-primary/10 text-primary border-primary/25";
    case "TEKLIF_VERILDI":
      return "bg-category-7/10 text-category-7 border-category-7/25";
    case "TAKIPTE":
      return "bg-primary/10 text-primary border-primary/25";
    case "RANDEVU_PLANLANDI":
      return "bg-warning/10 text-warning border-warning/25";
    case "OLUMSUZ":
      return "bg-destructive/10 text-destructive border-destructive/25";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}
