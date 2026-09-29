/**
 * Aday görünümleri ("Tümü" açılır listesinin "Görünümler" grubu, URL: ?tab=). Statüler ayrı grupta (?status=).
 */
export type CrmQuickTab =
  | ""
  | "DEMO_TANIMLANDI"
  | "RANDEVU_PLANLANDI"
  | "balance"
  | "demoEnded"
  | "newSignups"
  | "duplicates";

/** Görünümler (sıra = listede görünen sıra); etiketler crm.list.tabs.* */
export const CRM_VIEWS: { value: Exclude<CrmQuickTab, "">; labelKey: string }[] = [
  { value: "DEMO_TANIMLANDI", labelKey: "pendingDemo" },
  { value: "RANDEVU_PLANLANDI", labelKey: "inProgress" },
  { value: "balance", labelKey: "balance" },
  { value: "demoEnded", labelKey: "demoEnded" },
  { value: "newSignups", labelKey: "newSignups" },
  { value: "duplicates", labelKey: "duplicates" },
];

export const CRM_QUICK_TABS: CrmQuickTab[] = ["", ...CRM_VIEWS.map((v) => v.value)];

/** Tutar içeren görünümler — CRM_AGENT (finans yetkisi yok) görmez. */
export const FINANCIAL_VIEWS: CrmQuickTab[] = ["balance"];
