import { normalizeSearch } from "@/lib/data/tr-locations";

/**
 * Detaylı süzgeç yardımcıları (Adaylar + Soğuk listeler). Saf fonksiyonlar; karşılaştırma Türkçe duyarlı
 * (`normalizeSearch`: büyük/küçük harf, aksan ve ı/i farkı yok sayılır — "ISTANBUL" = "İstanbul" = "istanbul").
 */

/** Alan, aranan metni içeriyor mu? Boş sorgu her şeyle eşleşir. */
export function textIncludes(value: string | null | undefined, query: string): boolean {
  const q = normalizeSearch(query.trim());
  if (!q) return true;
  return normalizeSearch(value ?? "").includes(q);
}

/** İki konum adı aynı mı (il/ilçe seçimi; yazım farkı yok sayılır). Boş seçim her şeyle eşleşir. */
export function sameText(value: string | null | undefined, selected: string): boolean {
  const s = normalizeSearch(selected.trim());
  if (!s) return true;
  return normalizeSearch((value ?? "").trim()) === s;
}

/** Telefon sorgusunun karşılaştırma anahtarı: yalnız rakamlar, baştaki sıfırlar atılır ("0532 123" → "532123"). */
export function phoneQueryDigits(query: string): string {
  return query.replace(/\D/g, "").replace(/^0+/, "");
}

/**
 * Telefon süzgeci: sorgunun rakamları telefonlardan birinin rakamlarında geçiyor mu? E.164 ("+905321234567") ve
 * ham yazım ("0532 123 45 67") ikisi de eşleşir. Rakamsız / boş sorgu her şeyle eşleşir.
 */
export function phoneMatches(query: string, ...phones: (string | null | undefined)[]): boolean {
  const digits = phoneQueryDigits(query);
  if (!digits) return true;
  return phones.some((p) => (p ?? "").replace(/\D/g, "").includes(digits));
}

/** Var / yok süzgeci değeri ("" = hepsi). */
export type PresenceFilter = "" | "yes" | "no";

export function presenceMatches(has: boolean, filter: PresenceFilter | string): boolean {
  if (filter === "yes") return has;
  if (filter === "no") return !has;
  return true;
}

/**
 * Seçenek listesi: verideki dolu değerler, yazım farkı birleştirilmiş (ilk görülen yazım kalır), Türkçe sıralı.
 * İl/ilçe gibi açılır listeler YALNIZ veride olan değerleri gösterir (boş sonuç veren seçenek yok).
 */
export function distinctOptions(values: Iterable<string | null | undefined>): string[] {
  const byKey = new Map<string, string>();
  for (const raw of values) {
    const v = (raw ?? "").trim();
    if (!v) continue;
    const key = normalizeSearch(v);
    if (!byKey.has(key)) byKey.set(key, v);
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b, "tr"));
}
