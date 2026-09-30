import { foldTr } from "@/lib/domain/institutions/search";
import type { GrowthCustomer } from "./types";

/** Müşteri araması: ad, yetkili adı, e-posta ve telefon (rakamlarla). Saf; istemci tarafı. */
export function searchCustomers<T extends Pick<GrowthCustomer, "name" | "contactName" | "contactEmail" | "contactPhone">>(items: T[], query: string): T[] {
  const q = foldTr(query.trim());
  if (!q) return items;
  const digits = query.replace(/\D/g, "").replace(/^0+/, "");
  return items.filter((c) => {
    if (foldTr(c.name).includes(q)) return true;
    if (c.contactName && foldTr(c.contactName).includes(q)) return true;
    if (c.contactEmail && c.contactEmail.toLowerCase().includes(q)) return true;
    return digits.length >= 3 && !!c.contactPhone && c.contactPhone.replace(/\D/g, "").includes(digits);
  });
}
