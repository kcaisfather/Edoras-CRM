/**
 * Tutar girişi (DeepSportAdmin `parseSaleAmount`'tan): "12.500", "12.500,50", "12500.50", "₺ 1.250 TL"
 * hepsi okunur. Boş ya da okunamayan girdi → null (çağıran "zorunlu" / "geçersiz" der; sessizce 0 olmaz).
 */
export function parseAmount(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") return Number.isFinite(input) && input >= 0 ? input : null;
  const raw = input.replace(/[\s ₺]/g, "").replace(/(TL|TRY)$/i, "");
  if (raw === "") return null;
  let normalized: string;
  const lastDot = raw.lastIndexOf(".");
  const lastComma = raw.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    // İkisi birden varsa en sondaki ondalık ayırıcıdır ("12.500,50" / "12,500.50").
    const decimalSep = lastComma > lastDot ? "," : ".";
    const thousandSep = decimalSep === "," ? "." : ",";
    normalized = raw.split(thousandSep).join("").replace(decimalSep, ".");
  } else if (lastComma >= 0) {
    // Yalnız virgül: Türkçe ondalık ("1250,5"); birden çoksa binlik ("1,250,000").
    normalized = raw.indexOf(",") === lastComma ? raw.replace(",", ".") : raw.split(",").join("");
  } else if (lastDot >= 0) {
    // Yalnız nokta: tek nokta + 1–2 hane → ondalık ("12500.50"); aksi binlik ("14.950", "1.250.000").
    const single = raw.indexOf(".") === lastDot;
    normalized = single && /\.\d{1,2}$/.test(raw) ? raw : raw.split(".").join("");
  } else {
    normalized = raw;
  }
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const n = Math.round(Number(normalized) * 100) / 100;
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Tutarı ₺ ile biçimlendirir (kuruş varsa 2 hane). */
export function formatTry(amount: number): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}
