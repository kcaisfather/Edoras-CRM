"use client";

import { useTranslations } from "next-intl";
import {
  ActiveFilterChips,
  FilterCombobox,
  FilterField,
  FilterPanel,
  FilterSelect,
  FilterTextInput,
  type ActiveFilterChip,
} from "@/components/list";
import { FOLLOW_UP_FILTERS } from "@/lib/domain/crm/signals";
import type { LeadDetailFilters, LeadDetailKey, LeadDetailOptions } from "@/lib/domain/crm/detail-filter";

export const CRM_FILTER_PANEL_ID = "crm-detail-filters";

/** useCrmList'in detaylı süzgeç parçası (CrmList → CrmListToolbar → panel ve çipler). */
export interface CrmDetailFilterState {
  values: LeadDetailFilters;
  activeKeys: LeadDetailKey[];
  options: LeadDetailOptions;
  onChange: (key: LeadDetailKey, value: string) => void;
  onClear: () => void;
}

const fieldId = (key: LeadDetailKey) => `crm-filter-${key}`;
const PRESENCE_KEYS: readonly LeadDetailKey[] = ["hasPhone", "hasEmail", "linked", "complaint"];

/** Alan etiketleri ve çipteki değer metni: ortak olanlar `list.filters`, sayfaya özgüler `crm.list.filters`. */
function useFilterLabels() {
  const tf = useTranslations("list.filters");
  const t = useTranslations("crm.list.filters");
  const tProgram = useTranslations("crm.program");
  const tReason = useTranslations("crm.offer.reasons");
  const labels: Record<LeadDetailKey, string> = {
    city: tf("city"),
    district: tf("district"),
    phone: tf("phone"),
    email: tf("email"),
    org: t("organization"),
    contact: t("contact"),
    program: t("program"),
    follow: t("followUp"),
    lost: t("lostReason"),
    hasPhone: t("hasPhone"),
    hasEmail: t("hasEmail"),
    linked: t("linked"),
    complaint: t("complaint"),
  };
  const chipValue = (key: LeadDetailKey, value: string): string => {
    if (PRESENCE_KEYS.includes(key)) return value === "yes" ? tf("yes") : tf("no");
    if (key === "program") return tProgram(value);
    if (key === "lost") return tReason(value);
    if (key === "follow") return t(`followUpOptions.${value}`);
    return value.trim();
  };
  return { labels, chipValue };
}

/** Detaylı filtre paneli (araç satırındaki "Filtreler" düğmesiyle açılır): 13 alan, hepsi VE ile. */
export function CrmFilterPanel({ detail, open }: { detail: CrmDetailFilterState; open: boolean }) {
  const tf = useTranslations("list.filters");
  const t = useTranslations("crm.list.filters");
  const tProgram = useTranslations("crm.program");
  const tReason = useTranslations("crm.offer.reasons");
  const { labels } = useFilterLabels();
  const { values: f, options, onChange: set } = detail;
  const presenceOptions = [
    { value: "yes", label: tf("yes") },
    { value: "no", label: tf("no") },
  ];
  const text = (key: LeadDetailKey, placeholder: string, inputMode?: "text" | "tel" | "email") => (
    <FilterField id={fieldId(key)} label={labels[key]}>
      <FilterTextInput id={fieldId(key)} value={f[key]} onChange={(v) => set(key, v)} placeholder={placeholder} inputMode={inputMode} />
    </FilterField>
  );
  const select = (key: LeadDetailKey, items: { value: string; label: string }[], allLabel: string) => (
    <FilterField id={fieldId(key)} label={labels[key]}>
      <FilterSelect id={fieldId(key)} value={f[key]} onChange={(v) => set(key, v)} options={items} allLabel={allLabel} />
    </FilterField>
  );

  return (
    <FilterPanel id={CRM_FILTER_PANEL_ID} open={open} activeCount={detail.activeKeys.length} onClear={detail.onClear}>
      <FilterField id={fieldId("city")} label={labels.city}>
        <FilterCombobox id={fieldId("city")} value={f.city} onChange={(v) => set("city", v)} options={options.cities} placeholder={tf("cityAll")} />
      </FilterField>
      <FilterField id={fieldId("district")} label={labels.district}>
        <FilterCombobox
          id={fieldId("district")}
          value={f.district}
          onChange={(v) => set("district", v)}
          options={options.districts}
          placeholder={tf("districtAll")}
        />
      </FilterField>
      {text("phone", tf("phonePlaceholder"), "tel")}
      {text("email", tf("emailPlaceholder"), "email")}
      {text("org", t("organizationPlaceholder"))}
      {text("contact", t("contactPlaceholder"))}
      {select(
        "program",
        options.programs.map((p) => ({ value: p, label: tProgram(p) })),
        t("programAll")
      )}
      {select(
        "follow",
        FOLLOW_UP_FILTERS.map((v) => ({ value: v, label: t(`followUpOptions.${v}`) })),
        t("followUpAll")
      )}
      {select(
        "lost",
        options.lostReasons.map((r) => ({ value: r, label: tReason(r) })),
        t("lostReasonAll")
      )}
      {PRESENCE_KEYS.map((key) => (
        <FilterField key={key} id={fieldId(key)} label={labels[key]}>
          <FilterSelect id={fieldId(key)} value={f[key]} onChange={(v) => set(key, v)} options={presenceOptions} allLabel={tf("any")} />
        </FilterField>
      ))}
    </FilterPanel>
  );
}

/** Etkin detay süzgeçleri ("İl: Edirne", "Telefon: 0532"); panel kapalıyken de görünür. */
export function CrmFilterChips({ detail }: { detail: CrmDetailFilterState }) {
  const t = useTranslations("crm.list.filters");
  const { labels, chipValue } = useFilterLabels();
  const chips: ActiveFilterChip[] = detail.activeKeys.map((key) => ({
    key,
    label: t("chip", { label: labels[key], value: chipValue(key, detail.values[key]) }),
    onRemove: () => detail.onChange(key, ""),
  }));
  return <ActiveFilterChips chips={chips} onClearAll={detail.onClear} />;
}
