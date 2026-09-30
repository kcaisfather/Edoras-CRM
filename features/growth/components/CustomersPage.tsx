"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRouter } from "@/lib/navigation";
import { InfoTip } from "@/components/ui/info-tip";
import { CoverageNote } from "@/components/ui/coverage-note";
import { SEGMENT_ACTIVE, SEGMENT_GROUP, SEGMENT_INACTIVE, SEGMENT_ITEM, SegmentedControl } from "@/components/ui/segmented-control";
import { ListState } from "@/components/list";
import { cn } from "@/lib/utils";
import { CUSTOMER_SEGMENTS, inSegment, isCustomerSegment, segmentCounts, type CustomerSegment } from "@/lib/domain/growth/segments";
import { RECENTLY_ACTIVE_DAYS, RENEWAL_EXPIRED_LOOKBACK_DAYS, RENEWAL_WINDOW_DAYS, renewalRows } from "@/lib/domain/growth/renewals";
import { TOP_INSTITUTIONS_LIMIT, topInstitutions } from "@/lib/domain/growth/top";
import {
  DORMANT_PAYER_DAYS,
  NEVER_ACTIVATED_MIN_AGE_DAYS,
  NO_ACTIVITY_DAYS,
  USING_DAYS,
  WINDOW_DAYS_OPTIONS,
  matchesPreset,
  matchesUsage,
  type UsagePreset,
} from "@/lib/domain/growth/usage";
import type { GrowthCustomer } from "@/lib/domain/growth/types";
import { useGrowthCustomers, useWindowDays } from "../queries";
import { CustomersList } from "./CustomersList";
import { RenewalsList } from "./RenewalsList";
import { TopList } from "./TopList";

/**
 * Müşteri Takibi (DeepSport Müşteriler): tek sekme çubuğu — Hepsi, Kullanıyor, Kullanmıyor, Süresi Dolacaklar, Sadık (en aktif
 * kurumlar), hazır filtreler ve kurum segmentleri. Analiz görünümleri Müşteri Analizleri'nde (/growth/analytics).
 * DeepSport'tan farklar: Genişleme (kontenjan) yok — Edoras'ta koltuk kavramı yok; "Açık şikâyet" ön ayarı yok — CRM notu
 * kurum düzeyinde tutulmuyor; giriş logu yok — kullanım etkinlikten (yoklama, ödev, deneme, konu, duyuru, elle SMS) çıkar.
 */
export const CUSTOMER_TABS = [
  "all",
  "using",
  "notUsing",
  "renewals",
  "loyal",
  "inactive14",
  "noActivity30",
  ...CUSTOMER_SEGMENTS,
] as const;
export type CustomerTab = (typeof CUSTOMER_TABS)[number];
export const DEFAULT_CUSTOMER_TAB: CustomerTab = "all";

/** Kurum listesinde olmayan (durumu yalnız `usage`'a bağlı) kurumlar sayılmaz: Edoras'ta okunamayan kullanım "bilinmiyor". */
function tabFilter(tab: CustomerTab, now: Date): ((c: GrowthCustomer) => boolean) | null {
  switch (tab) {
    case "all":
      return () => true;
    case "using":
    case "notUsing":
      return (c) => matchesUsage(c, tab, now);
    case "inactive14":
    case "noActivity30":
      return (c) => matchesPreset(c, tab as UsagePreset, now);
    case "renewals":
    case "loyal":
      return null;
    default:
      return isCustomerSegment(tab) ? (c) => inSegment(c, tab as CustomerSegment, now) : null;
  }
}

const TAB_INFO_VALUES: Partial<Record<CustomerTab, Record<string, number>>> = {
  using: { days: USING_DAYS },
  notUsing: { days: USING_DAYS },
  renewals: { days: RENEWAL_WINDOW_DAYS, lookback: RENEWAL_EXPIRED_LOOKBACK_DAYS, active: RECENTLY_ACTIVE_DAYS },
  loyal: { limit: TOP_INSTITUTIONS_LIMIT },
  inactive14: { days: USING_DAYS },
  noActivity30: { days: NO_ACTIVITY_DAYS },
  neverActivated: { days: NEVER_ACTIVATED_MIN_AGE_DAYS },
  dormantPayers: { days: DORMANT_PAYER_DAYS },
};

export function CustomersPage() {
  const t = useTranslations("growth.customers");
  const [windowDays, setWindowDays] = useWindowDays();
  const query = useGrowthCustomers(windowDays);
  const searchParams = useSearchParams();
  const router = useRouter();
  const tabParam = searchParams.get("tab") ?? DEFAULT_CUSTOMER_TAB;
  const tab: CustomerTab = (CUSTOMER_TABS as readonly string[]).includes(tabParam) ? (tabParam as CustomerTab) : DEFAULT_CUSTOMER_TAB;
  const customers = useMemo(() => query.data?.customers ?? [], [query.data]);

  const counts = useMemo(() => {
    const now = new Date();
    const out = {} as Record<CustomerTab, number>;
    const segs = segmentCounts(customers, now);
    for (const k of CUSTOMER_TABS) {
      if (k === "renewals") out[k] = renewalRows(customers, now).length;
      else if (k === "loyal") out[k] = topInstitutions(customers).length;
      else if (isCustomerSegment(k)) out[k] = segs[k];
      else out[k] = customers.filter(tabFilter(k, now) ?? (() => false)).length;
    }
    return out;
  }, [customers]);

  const list = useMemo(() => {
    const filter = tabFilter(tab, new Date());
    return filter ? customers.filter(filter) : [];
  }, [tab, customers]);

  const unreadable = customers.filter((c) => !c.usage).length;
  const setTab = (next: CustomerTab) => {
    // Sekme değişince sekmeye özgü süzgeçler (arama, kova, tür, sıralama) sıfırlanır; yalnız pencere (`window`) korunur.
    const params = new URLSearchParams();
    const keep = searchParams.get("window");
    if (keep) params.set("window", keep);
    if (next !== DEFAULT_CUSTOMER_TAB) params.set("tab", next);
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <SegmentedControl<string>
          value={String(windowDays)}
          onValueChange={(v) => setWindowDays(Number(v))}
          aria-label={t("windowLabel")}
          options={WINDOW_DAYS_OPTIONS.map((d) => ({ value: String(d), label: t("windowOption", { days: d }) }))}
        />
      </div>

      {/* Tek sekme çubuğu; her sekmenin yanında tanım ipucu. */}
      <div role="tablist" aria-label={t("tabsLabel")} className={cn(SEGMENT_GROUP, "flex-wrap")}>
        {CUSTOMER_TABS.map((v) => {
          const active = v === tab;
          return (
            <span key={v} className="inline-flex items-center">
              <button
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(v)}
                className={cn(SEGMENT_ITEM, active ? SEGMENT_ACTIVE : SEGMENT_INACTIVE, "pr-1.5")}
              >
                {t(`tabs.${v}`)}
                {query.data ? (
                  <span className="rounded-full bg-muted-foreground/15 px-1.5 text-[11px] font-medium leading-4 tabular-nums">{counts[v].toLocaleString("tr-TR")}</span>
                ) : null}
              </button>
              <InfoTip label={t("tabInfoLabel", { tab: t(`tabs.${v}`) })} align="start" className="mr-1">
                {t(`tabInfo.${v}`, TAB_INFO_VALUES[v])}
              </InfoTip>
            </span>
          );
        })}
      </div>

      <ListState isLoading={query.isLoading} isError={query.isError} onRetry={() => query.refetch()}>
        {unreadable > 0 ? <CoverageNote>{t("unreadable", { count: unreadable })}</CoverageNote> : null}
        {tab === "renewals" ? <RenewalsList customers={customers} /> : null}
        {tab === "loyal" ? <TopList customers={customers} windowDays={windowDays} /> : null}
        {tab !== "renewals" && tab !== "loyal" ? <CustomersList key={tab} rows={list} windowDays={windowDays} /> : null}
      </ListState>
    </div>
  );
}
