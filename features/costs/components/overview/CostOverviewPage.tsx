"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, CalendarRange, Info, MessageSquareText, TrendingUp, Wallet } from "lucide-react";
import { Link } from "@/lib/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { useCostAlerts, useCostOverview, useSmsEstimate } from "../../queries";
import { CostKpiCard } from "../shared/CostKpiCard";
import { CostEmptyState, CostErrorState, CostPanel } from "../shared/CostStates";
import { AlertTypeBadge, SeverityBadge, ServiceLabel } from "../shared/Badges";
import { KPI_ORBS, SERVICE_COLORS, formatLira, formatMonth, formatNumber, formatPct } from "../shared/format";
import { ServiceDonut, TrendBars, type DonutSlice } from "../charts/Charts";
import { AlertText } from "../alerts/AlertText";

/** Maliyetler → Genel bakış (DeepSport CostOverviewPage): bu ay, ay sonu tahmini, geçen ay, hizmet payları, 12 aylık eğilim, uyarılar. */
export function CostOverviewPage() {
  const t = useTranslations("costs");
  const tOverview = useTranslations("costs.overview");
  const tKpi = useTranslations("costs.kpi");
  const overviewQ = useCostOverview();
  const alertsQ = useCostAlerts();
  const overview = overviewQ.data;
  const smsQ = useSmsEstimate(overview?.month ?? "");
  const sms = overview ? smsQ.data : undefined;

  const slices: DonutSlice[] = useMemo(
    () => (overview?.byService ?? []).map((s) => ({ key: s.service, label: t(`services.names.${s.service}`), value: s.amountTry, color: SERVICE_COLORS[s.service] })),
    [overview, t]
  );

  if (overviewQ.isError) return <CostErrorState onRetry={() => void overviewQ.refetch()} />;

  const mom = overview?.monthOverMonthPct ?? null;

  return (
    <div className="space-y-6">
      {overview && !overview.hasEntries ? (
        <CostPanel orb="vision-card-orb-emerald">
          <CostEmptyState message={tOverview("emptyLedger")} />
          <div className="mt-2 text-center">
            <Link href="/costs/entries" className="text-sm font-medium text-primary hover:underline">
              {tOverview("goToEntries")}
            </Link>
          </div>
        </CostPanel>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 lg:grid-cols-4">
        <CostKpiCard title={tKpi("monthToDate")} value={formatLira(overview?.monthToDateTry)} subtitle={overview ? formatMonth(overview.month) : undefined} icon={Wallet} {...KPI_ORBS.blue} isLoading={overviewQ.isLoading} />
        <CostKpiCard
          title={tKpi("forecast")}
          value={formatLira(overview?.forecastTry)}
          icon={TrendingUp}
          {...KPI_ORBS.purple}
          isLoading={overviewQ.isLoading}
          trendLabel={mom !== null ? tKpi("vsPrevious") : undefined}
          trendValue={mom !== null ? `${mom > 0 ? "+" : ""}${formatPct(mom, 1)}` : undefined}
          trendNegative={mom !== null && mom > 0}
        />
        <CostKpiCard title={tKpi("previousMonth")} value={formatLira(overview?.previousMonthTry)} icon={CalendarRange} {...KPI_ORBS.orange} isLoading={overviewQ.isLoading} />
        <CostKpiCard
          title={tKpi("activeAlerts")}
          value={formatNumber(overview?.activeAlerts ?? 0)}
          icon={AlertTriangle}
          {...(overview && overview.activeAlerts > 0 ? KPI_ORBS.pink : KPI_ORBS.emerald)}
          iconClass={overview && overview.activeAlerts > 0 ? "text-destructive" : "text-success"}
          isLoading={overviewQ.isLoading}
          subtitle={tKpi("computedOnRead")}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-3">
        <CostPanel className="lg:col-span-2" title={tOverview("trendTitle")} description={tOverview("trendDescription")}>
          {overviewQ.isLoading || !overview ? <Skeleton className="h-[260px] w-full rounded-2xl" /> : <TrendBars points={overview.trend} />}
          {overview ? (
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {[...new Set(overview.trend.flatMap((p) => Object.keys(p.byService)))].map((s) => (
                <li key={s}>
                  <ServiceLabel service={s as keyof typeof SERVICE_COLORS} />
                </li>
              ))}
            </ul>
          ) : null}
        </CostPanel>

        <CostPanel orb="vision-card-orb-teal" title={tOverview("byServiceTitle")}>
          {overviewQ.isLoading ? (
            <Skeleton className="mx-auto h-44 w-44 rounded-full" />
          ) : slices.length === 0 ? (
            <CostEmptyState message={tOverview("byServiceEmpty")} />
          ) : (
            <>
              <ServiceDonut data={slices} centerLabel={tKpi("totalSpend")} centerValue={formatLira(overview?.monthToDateTry)} />
              <div className="mt-4 space-y-1.5">
                {overview?.byService.map((s) => (
                  <div key={s.service} className="flex items-center justify-between text-xs">
                    <ServiceLabel service={s.service} />
                    <span className="font-mono text-foreground">
                      {formatLira(s.amountTry)} <span className="text-muted-foreground">· {formatPct(s.sharePct, 0)}</span>
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </CostPanel>
      </div>

      <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-2">
        <CostPanel orb="vision-card-orb-orange" title={tOverview("topServicesTitle")}>
          {overviewQ.isLoading ? (
            <Skeleton className="h-40 w-full rounded-xl" />
          ) : overview && overview.byService.length > 0 ? (
            <div className="space-y-2">
              {overview.byService.slice(0, 5).map((svc, idx) => (
                <div key={svc.service} className="flex items-center justify-between rounded-xl p-2.5 transition-colors hover:bg-muted/50">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-muted text-[10px] font-bold text-muted-foreground">{idx + 1}</span>
                    <ServiceLabel service={svc.service} className="text-sm text-foreground" />
                  </div>
                  <span className="ml-3 shrink-0 font-mono text-foreground">{formatLira(svc.amountTry)}</span>
                </div>
              ))}
            </div>
          ) : (
            <CostEmptyState message={tOverview("topServicesEmpty")} />
          )}
        </CostPanel>

        <CostPanel
          orb="vision-card-orb-pink"
          title={
            <span className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              {tOverview("activeAlertsTitle")}
            </span>
          }
          actions={
            <Link href="/costs/alerts" className="text-xs font-medium text-primary hover:underline">
              {tOverview("allAlerts")}
            </Link>
          }
        >
          {alertsQ.isLoading ? (
            <Skeleton className="h-40 w-full rounded-xl" />
          ) : alertsQ.isError ? (
            <CostErrorState onRetry={() => void alertsQ.refetch()} />
          ) : alertsQ.data && alertsQ.data.items.length > 0 ? (
            <div className="space-y-2">
              {alertsQ.data.items.slice(0, 5).map((a) => (
                <div key={a.id} className="rounded-xl border border-border bg-muted/50 p-3">
                  <div className="mb-1 flex items-start justify-between gap-3">
                    <SeverityBadge severity={a.severity} />
                    <AlertTypeBadge type={a.type} />
                  </div>
                  <p className="text-xs text-foreground">
                    <AlertText alert={a} />
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <CostEmptyState message={tOverview("activeAlertsEmpty")} />
          )}
        </CostPanel>
      </div>

      <CostPanel orb="vision-card-orb-indigo" title={<span className="flex items-center gap-2"><MessageSquareText className="h-4 w-4 text-category-3" />{tOverview("smsTitle")}</span>} description={tOverview("smsDescription")}>
        {!sms ? (
          <Skeleton className="h-16 w-full rounded-xl" />
        ) : !sms.available ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Info className="h-4 w-4 shrink-0" />
            {tOverview("smsUnavailable")}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{tOverview("smsRecipients")}</p>
              <p className="mt-1 text-2xl font-light">{formatNumber(sms.recipients)}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{tOverview("smsEstimated")}</p>
              <p className="mt-1 text-2xl font-light">{sms.unitPriceTry > 0 ? formatLira(sms.estimatedTry) : "—"}</p>
              {sms.unitPriceTry <= 0 ? <p className="mt-1 text-xs text-muted-foreground">{tOverview("smsNoPrice")}</p> : null}
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{tOverview("smsLedger")}</p>
              <p className="mt-1 text-2xl font-light">{sms.ledgerTry > 0 ? formatLira(sms.ledgerTry) : "—"}</p>
            </div>
          </div>
        )}
        {sms?.truncated ? <p className="mt-2 text-xs text-muted-foreground">{tOverview("smsTruncated")}</p> : null}
      </CostPanel>
    </div>
  );
}
