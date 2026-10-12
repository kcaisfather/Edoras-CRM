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
import { PRESENCE_FILTER_KEYS, PROSPECT_FILTER_KEYS, type ProspectFilterKey } from "@/lib/domain/cold-lists/utils";
import type { ColdListView } from "../hooks";

export const PROSPECT_FILTER_PANEL_ID = "cold-list-detail-filters";

const fieldId = (key: ProspectFilterKey) => `cold-filter-${key}`;

/** Alan etiketleri: ortak olanlar `list.filters`, sayfaya özgüler `growth.coldLists.detailFilters`. */
function useFilterLabels() {
  const tf = useTranslations("list.filters");
  const t = useTranslations("growth.coldLists.detailFilters");
  const labels: Record<ProspectFilterKey, string> = {
    city: tf("city"),
    district: tf("district"),
    phone: tf("phone"),
    email: tf("email"),
    organization: t("organization"),
    name: t("name"),
    branch: t("branch"),
    note: t("note"),
    hasPhone: t("hasPhone"),
    hasEmail: t("hasEmail"),
    inCrm: t("inCrm"),
  };
  /** Çipteki değer: var / yok alanlarında "Var" / "Yok", diğerlerinde yazılan / seçilen metin. */
  const chipValue = (key: ProspectFilterKey, v: string) =>
    (PRESENCE_FILTER_KEYS as readonly string[]).includes(key) ? (v === "yes" ? tf("yes") : tf("no")) : v;
  return { labels, chipValue };
}

/** Detaylı filtre paneli (araç satırındaki "Filtreler" düğmesiyle açılır): 11 alan, hepsi VE ile. */
export function ProspectFilterPanel({ view, open }: { view: ColdListView; open: boolean }) {
  const tf = useTranslations("list.filters");
  const t = useTranslations("growth.coldLists.detailFilters");
  const { labels } = useFilterLabels();
  const f = view.detailFilters;
  const set = view.setDetailFilter;
  const presenceOptions = [
    { value: "yes", label: tf("yes") },
    { value: "no", label: tf("no") },
  ];
  const text = (key: ProspectFilterKey, placeholder: string, inputMode?: "text" | "tel" | "email") => (
    <FilterField id={fieldId(key)} label={labels[key]}>
      <FilterTextInput id={fieldId(key)} value={f[key]} onChange={(v) => set(key, v)} placeholder={placeholder} inputMode={inputMode} />
    </FilterField>
  );
  const presence = (key: ProspectFilterKey) => (
    <FilterField id={fieldId(key)} label={labels[key]}>
      <FilterSelect id={fieldId(key)} value={f[key]} onChange={(v) => set(key, v)} options={presenceOptions} allLabel={tf("any")} />
    </FilterField>
  );
  return (
    <FilterPanel id={PROSPECT_FILTER_PANEL_ID} open={open} activeCount={view.detailActiveCount} onClear={view.clearDetailFilters}>
      <FilterField id={fieldId("city")} label={labels.city}>
        <FilterCombobox
          id={fieldId("city")}
          value={f.city}
          onChange={(v) => set("city", v)}
          options={view.filterOptions.cities}
          placeholder={tf("cityAll")}
        />
      </FilterField>
      <FilterField id={fieldId("district")} label={labels.district}>
        <FilterCombobox
          id={fieldId("district")}
          value={f.district}
          onChange={(v) => set("district", v)}
          options={view.filterOptions.districts}
          placeholder={tf("districtAll")}
        />
      </FilterField>
      {text("phone", tf("phonePlaceholder"), "tel")}
      {text("email", tf("emailPlaceholder"), "email")}
      {text("organization", t("organizationPlaceholder"))}
      {text("name", t("namePlaceholder"))}
      <FilterField id={fieldId("branch")} label={labels.branch}>
        <FilterCombobox
          id={fieldId("branch")}
          value={f.branch}
          onChange={(v) => set("branch", v)}
          options={view.filterOptions.branches}
          placeholder={t("branchAll")}
        />
      </FilterField>
      {text("note", t("notePlaceholder"))}
      {presence("hasPhone")}
      {presence("hasEmail")}
      {presence("inCrm")}
    </FilterPanel>
  );
}

/** Etkin süzgeç çipleri ("İl: Edirne") + süzgeç / arama varken "{gösterilen} / {toplam} kişi". */
export function ProspectFilterSummary({ view }: { view: ColdListView }) {
  const t = useTranslations("growth.coldLists.detailFilters");
  const { labels, chipValue } = useFilterLabels();
  const f = view.detailFilters;
  const chips: ActiveFilterChip[] = PROSPECT_FILTER_KEYS.filter((k) => f[k].trim() !== "").map((k) => ({
    key: k,
    label: t("chip", { label: labels[k], value: chipValue(k, f[k].trim()) }),
    onRemove: () => view.setDetailFilter(k, ""),
  }));
  const showCount = chips.length > 0 || view.q.trim() !== "";
  if (!showCount) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <ActiveFilterChips chips={chips} onClearAll={view.clearDetailFilters} />
      <span className="ml-auto text-xs tabular-nums text-muted-foreground" aria-live="polite">
        {t("resultCount", { shown: view.filtered.length, total: view.listProspects.length })}
      </span>
    </div>
  );
}
