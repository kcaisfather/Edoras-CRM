"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { InfoTip } from "@/components/ui/info-tip";
import { Money } from "@/components/ui/money";
import { FinancialOnly } from "@/features/auth";
import { useUrlParam } from "@/lib/hooks/use-url-param";
import { addDays, todayIso } from "@/lib/domain/institutions/rules";
import {
  LOW_CONFIDENCE_MIN,
  RENEWAL_GRACE_DAYS,
  buildPackages,
  churnSummary,
  classifyPackages,
  cohortMatrix,
  continuationBreakdown,
  dayMs,
  monthlyChurn,
  recentlyRenewedInstitutions,
} from "@/lib/domain/growth/retention";
import { USING_DAYS } from "@/lib/domain/growth/usage";
import type { GrowthCustomer } from "@/lib/domain/growth/types";
import { ChurnTrendChart, CohortSection, ContinuationCard, usePercentFormat } from "./RetentionCharts";

const RANGES = ["all", "y1", "m6", "m3"] as const;
type RangeKey = (typeof RANGES)[number];

/** Dönem seçenekleri: bitişi son 3 / 6 / 12 ayda olan paketler ya da tüm zamanlar. */
function rangeOf(key: RangeKey, now: Date): { from: number; to: number } | null {
  if (key === "all") return null;
  const months = key === "m3" ? 3 : key === "m6" ? 6 : 12;
  const today = todayIso(now);
  return { from: dayMs(addDays(today, -months * 30)), to: now.getTime() };
}

/**
 * Retention & Churn (Müşteri Analizleri → ?section=retention): dönem churn / yenileme / anlık devam oranı (+ gelir churn'ü,
 * yalnız ADMIN), aylık trend, ilk lisans kohortu ve anlık devam durumu. Paket dönemleri KESİN: her ücretli lisans bir paket
 * (DeepSport'ta ödeme + ürün süresinden tahmin edilirdi). Hesaplar: lib/domain/growth/retention.ts.
 */
export function RetentionView({ customers }: { customers: GrowthCustomer[] }) {
  const t = useTranslations("growth.retentionChurn");
  const pct = usePercentFormat();
  const [rangeParam, setRange] = useUrlParam("rr", "all");
  const range: RangeKey = (RANGES as readonly string[]).includes(rangeParam) ? (rangeParam as RangeKey) : "all";

  const calc = useMemo(() => {
    const now = new Date();
    const packages = buildPackages(customers);
    const results = classifyPackages(packages, now.getTime());
    return {
      packageCount: packages.length,
      summary: churnSummary(results, rangeOf(range, now), now.getTime()),
      months: monthlyChurn(results, now),
      cohort: cohortMatrix(packages, now),
      breakdown: continuationBreakdown(customers, recentlyRenewedInstitutions(results, now.getTime()), now),
    };
  }, [customers, range]);

  const { summary, breakdown } = calc;
  const grace = { grace: RENEWAL_GRACE_DAYS };
  const pendingFoot = summary.pending > 0 ? t("kpi.pending", { count: summary.pending }) : null;
  const lowFoot = summary.decided > 0 && summary.lowConfidence ? t("kpi.lowConfidence", { min: LOW_CONFIDENCE_MIN }) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("rangeLabel")}>
        {RANGES.map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={range === r}
            onClick={() => setRange(r)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${range === r ? "border-primary/30 bg-primary/10 text-primary" : "border-border bg-card/60 text-muted-foreground hover:text-foreground"}`}
          >
            {t(`ranges.${r}`)}
          </button>
        ))}
      </div>

      {calc.packageCount === 0 ? (
        <p className="rounded-2xl border border-border bg-card/60 p-6 text-sm text-muted-foreground">{t("noPackages")}</p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={t("kpi.churn")} def={t("defs.churn", grace)} value={pct(summary.churnRate)} detail={`${summary.churned}/${summary.decided}`} foot={[pendingFoot, lowFoot]} />
        <Kpi label={t("kpi.renewal")} def={t("defs.renewal", grace)} value={pct(summary.renewalRate)} detail={`${summary.renewed}/${summary.decided}`} foot={[pendingFoot, lowFoot]} />
        <Kpi
          label={t("kpi.ongoing")}
          def={t("defs.ongoing", { days: USING_DAYS })}
          value={pct(breakdown.ongoingUsing.of ? breakdown.ongoingUsing.count / breakdown.ongoingUsing.of : null)}
          detail={`${breakdown.ongoingUsing.count}/${breakdown.ongoingUsing.of}`}
          foot={[t("kpi.snapshot")]}
        />
        <FinancialOnly>
          <Kpi
            label={t("kpi.revenueChurn")}
            def={t("defs.revenueChurn")}
            value={pct(summary.revenueChurnRate)}
            detail={
              summary.revenueDecided > 0 ? (
                <>
                  <Money value={summary.revenueChurned} /> {t("kpi.lost")} / <Money value={summary.revenueDecided} />
                </>
              ) : null
            }
            foot={[lowFoot]}
          />
        </FinancialOnly>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChurnTrendChart months={calc.months} />
        <ContinuationCard breakdown={breakdown} />
      </div>

      <CohortSection rows={calc.cohort.rows} curve={calc.cohort.curve} />
    </div>
  );
}

function Kpi({ label, def, value, detail, foot }: { label: string; def: string; value: string; detail?: React.ReactNode; foot?: (string | null)[] }) {
  const lines = (foot ?? []).filter(Boolean);
  return (
    <div className="glass-panel rounded-2xl px-4 py-3">
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        {label}
        <InfoTip label={label} align="start">
          {def}
        </InfoTip>
      </p>
      <p className="flex flex-wrap items-baseline gap-x-1.5 text-lg font-semibold leading-tight tabular-nums">
        {value}
        {detail != null && <span className="text-xs font-normal text-muted-foreground">· {detail}</span>}
      </p>
      {lines.length > 0 && <p className="mt-0.5 text-[11px] text-muted-foreground">{lines.join(" · ")}</p>}
    </div>
  );
}
