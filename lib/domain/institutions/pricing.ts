/**
 * Lisans fiyatı: tek liste fiyatı (Ayarlar → crm_license_pricing) + satışta indirim yüzdesi; elle bedel yalnız istisna.
 * SQL ile aynı kural (crm_licenses_discount_check): bedel = round(liste × (100 − yüzde)) / 100 — kuruşa yuvarlı,
 * yarım kuruş yukarı. Kayan nokta hatası olmasın diye kuruş ve baz puan (yüzde × 100) tamsayılarıyla hesaplanır.
 */
import { parseAmount } from "@/lib/utils/money";

/** Yüzde girdisi: "10", "12,5", "%15" → sayı; boş → null; okunamayan / aralık dışı → NaN (doğrulama yakalar). */
export function parsePercent(input: string | null | undefined): number | null {
  if (input == null) return null;
  const raw = input.replace(/[\s%]/g, "").replace(",", ".");
  if (!raw) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return Number.NaN;
  const n = Number(raw);
  return n >= 0 && n <= 100 ? n : Number.NaN;
}

/** Liste fiyatı ve indirim yüzdesinden bedel (kuruşa yuvarlı). */
export function priceFromDiscount(listPrice: number, discountPercent: number): number {
  const listCents = Math.round(listPrice * 100);
  const keepBp = 10000 - Math.round(discountPercent * 100);
  return Math.floor((listCents * keepBp + 5000) / 10000) / 100;
}

export interface LicensePricing {
  price: number;
  /** Elle bedelde null. */
  listPrice: number | null;
  /** Elle bedelde null. */
  discountPercent: number | null;
}

/** Formdaki fiyat alanları (şemalar ve ekran ortak). */
export interface LicensePriceFields {
  licenseDiscount: string;
  licensePriceManual: boolean;
  licensePrice: string;
}

/**
 * Form → yazılacak fiyat. `listPrice`: yüzdenin uygulanacağı liste fiyatı (yeni satışta Ayarlar'daki, düzeltmede
 * lisansın kendi liste fiyatı varsa o). Yüzde modunda liste fiyatı yoksa ya da girdi geçersizse null.
 */
export function resolveLicensePricing(v: LicensePriceFields, listPrice: number | null): LicensePricing | null {
  if (v.licensePriceManual) {
    const price = parseAmount(v.licensePrice);
    return price === null ? null : { price, listPrice: null, discountPercent: null };
  }
  const pct = parsePercent(v.licenseDiscount);
  if (listPrice == null || !(listPrice > 0) || pct === null || Number.isNaN(pct)) return null;
  return { price: priceFromDiscount(listPrice, pct), listPrice, discountPercent: pct };
}

/** Kayıtlı lisanstan formun fiyat alanları: indirimliyse yüzde, değilse elle bedel. */
export function licensePriceFormValues(license: { price: number | null; discountPercent: number | null } | null): LicensePriceFields {
  if (license && license.discountPercent != null) {
    return { licenseDiscount: String(license.discountPercent).replace(".", ","), licensePriceManual: false, licensePrice: "" };
  }
  if (license && license.price != null) {
    return { licenseDiscount: "", licensePriceManual: true, licensePrice: String(license.price).replace(".", ",") };
  }
  return { licenseDiscount: "0", licensePriceManual: false, licensePrice: "" };
}
