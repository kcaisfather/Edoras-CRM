import { LICENSE_WARNING_DAYS, daysBetween } from "./rules";
import type { InstitutionListItem } from "./types";

/**
 * Ekrandaki durum. Veritabanında yalnız DEMO / UCRETLI etiketi tutulur; süresi dolan demo ya da
 * biten lisans burada türetilir. Demo süresi dolunca kurum PASİFE DÜŞMEZ — yalnız "Demo bitti" görünür.
 */
export type InstitutionState =
  | "EDORAS_YOK" // CRM kaydı var, kurum Edoras'ta yok (silinmiş) — mali kayıt kaybolmasın diye listede
  | "PASIF" // institutions.is_active = false (edoras-admin tarafında kapatılmış)
  | "KAYITSIZ" // CRM kaydı yok (CRM öncesinden kalan kurum)
  | "DEMO"
  | "DEMO_BITTI"
  | "UCRETLI"
  | "LISANS_BITTI";

export interface InstitutionStatusInfo {
  state: InstitutionState;
  /** Demo ya da lisans bitişine kalan gün (geçmişse negatif); ilgili tarih yoksa null. */
  daysLeft: number | null;
  /** Ücretli ve lisansın bitmesine LICENSE_WARNING_DAYS ya da daha az gün var. */
  licenseSoon: boolean;
}

export function institutionStatus(
  item: Pick<InstitutionListItem, "isActive" | "crm" | "licenseEndsOn"> & { missingInEdoras?: boolean },
  today: string
): InstitutionStatusInfo {
  if (item.missingInEdoras) return { state: "EDORAS_YOK", daysLeft: null, licenseSoon: false };
  if (!item.isActive) return { state: "PASIF", daysLeft: null, licenseSoon: false };
  const crm = item.crm;
  if (!crm) return { state: "KAYITSIZ", daysLeft: null, licenseSoon: false };

  if (crm.status === "DEMO") {
    if (!crm.demoEndsAt) return { state: "DEMO", daysLeft: null, licenseSoon: false };
    const daysLeft = daysBetween(today, crm.demoEndsAt);
    return { state: daysLeft > 0 ? "DEMO" : "DEMO_BITTI", daysLeft, licenseSoon: false };
  }

  if (!item.licenseEndsOn) return { state: "UCRETLI", daysLeft: null, licenseSoon: false };
  const daysLeft = daysBetween(today, item.licenseEndsOn);
  if (daysLeft <= 0) return { state: "LISANS_BITTI", daysLeft, licenseSoon: false };
  return { state: "UCRETLI", daysLeft, licenseSoon: daysLeft <= LICENSE_WARNING_DAYS };
}

/** Liste süzgeci. */
export const INSTITUTION_FILTERS = [
  "all",
  "demo",
  "demoExpired",
  "paid",
  "licenseSoon",
  "licenseExpired",
  "unregistered",
  "inactive",
] as const;
export type InstitutionFilter = (typeof INSTITUTION_FILTERS)[number];

export function matchesFilter(info: InstitutionStatusInfo, filter: InstitutionFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "demo":
      return info.state === "DEMO";
    case "demoExpired":
      return info.state === "DEMO_BITTI";
    case "paid":
      return info.state === "UCRETLI";
    case "licenseSoon":
      return info.licenseSoon;
    case "licenseExpired":
      return info.state === "LISANS_BITTI";
    case "unregistered":
      return info.state === "KAYITSIZ";
    case "inactive":
      return info.state === "PASIF" || info.state === "EDORAS_YOK";
  }
}

/** Liste sıralaması: önce aksiyon isteyenler (demo bitti, lisans bitti/yaklaşıyor), sonra ada göre. */
const STATE_PRIORITY: Record<InstitutionState, number> = {
  DEMO_BITTI: 0,
  LISANS_BITTI: 1,
  DEMO: 3,
  UCRETLI: 4,
  KAYITSIZ: 5,
  PASIF: 6,
  EDORAS_YOK: 7,
};

export function statusPriority(info: InstitutionStatusInfo): number {
  return info.licenseSoon ? 2 : STATE_PRIORITY[info.state];
}
