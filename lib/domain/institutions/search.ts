import type { InstitutionListItem } from "./types";

/** Türkçe büyük/küçük harf ve aksan duyarsız karşılaştırma anahtarı. */
export function foldTr(value: string): string {
  return value.toLocaleLowerCase("tr").normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Kurum araması: ad, yetkili adı, e-posta ve telefon (rakamlarla; "0532 123" → "+90532123…" eşleşir).
 * Liste zaten tamamen istemcide olduğu için arama yereldir.
 */
export function searchInstitutions<T extends Pick<InstitutionListItem, "name" | "crm">>(items: T[], query: string): T[] {
  const q = foldTr(query.trim());
  if (!q) return items;
  const digits = query.replace(/\D/g, "").replace(/^0+/, "");
  return items.filter((item) => {
    if (foldTr(item.name).includes(q)) return true;
    const crm = item.crm;
    if (!crm) return false;
    if (foldTr(crm.contactName).includes(q) || crm.contactEmail.includes(q)) return true;
    return digits.length >= 3 && crm.contactPhone.replace(/\D/g, "").includes(digits);
  });
}
