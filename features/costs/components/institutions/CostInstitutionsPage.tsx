"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Building2, Info, MessageSquareText, Receipt, Users2, Wallet } from "lucide-react";
import { Link } from "@/lib/navigation";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { InstitutionCostRow } from "@/lib/domain/costs/types";
import { useInstitutionCosts } from "../../queries";
import { CostKpiCard } from "../shared/CostKpiCard";
import { CostEmptyState, CostErrorState, CostPanel, CostRowsSkeleton } from "../shared/CostStates";
import { MarginBadge } from "../shared/Badges";
import { MonthPicker, useMonthParam } from "../shared/MonthPicker";
import { KPI_ORBS, formatLira, formatLiraExact, formatMonth, formatNumber, formatPct } from "../shared/format";
import { ExportButton } from "../exports/ExportButton";

type StatusFilter = "ALL" | "PAID" | "DEMO" | "OTHER";

const statusOf = (r: InstitutionCostRow): StatusFilter => (r.status === "UCRETLI" ? "PAID" : r.status === "DEMO" ? "DEMO" : "OTHER");

/**
 * Maliyetler → Kurumlar (DeepSport "Kullanıcılar" ekranının Edoras karşılığı): kurum başına maliyet ve lisansa göre marj.
 * Ortak maliyet (SMS hariç) aktif öğrenci sayısıyla paylaştırılır; SMS kurumun kendi alıcılarına yazılır. Gelir = o aya düşen lisans
 * bedeli (1 yıllık lisans / 12). Demo ve bedelsiz lisans geliri 0'dır ("gelirsiz"). Lisans bedeli içerir: yalnız ADMIN.
 */
export function CostInstitutionsPage() {
  const t = useTranslations("costs.institutions");
  const [month, setMonth] = useMonthParam();
  const [filter, setFilter] = useState<StatusFilter>("ALL");
  const q = useInstitutionCosts(month);
  const data = q.data;

  const rows = useMemo(() => {
    const items = (data?.items ?? []).filter((r) => filter === "ALL" || statusOf(r) === filter);
    return [...items].sort((a, b) => b.totalCostTry - a.totalCostTry || a.name.localeCompare(b.name, "tr"));
  }, [data, filter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <MonthPicker value={month} onChange={setMonth} />
          <SegmentedControl<StatusFilter>
            aria-label={t("filterLabel")}
            value={filter}
            onValueChange={setFilter}
            options={[
              { value: "ALL", label: t("filters.ALL") },
              { value: "PAID", label: t("filters.PAID") },
              { value: "DEMO", label: t("filters.DEMO") },
              { value: "OTHER", label: t("filters.OTHER") },
            ]}
          />
        </div>
        <ExportButton kind="institutions" month={month} />
      </div>

      {q.isError && !data ? (
        <CostErrorState onRetry={() => void q.refetch()} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 lg:grid-cols-4">
          <CostKpiCard title={t("kpi.sharedPool")} value={formatLira(data?.sharedPoolTry)} icon={Wallet} {...KPI_ORBS.blue} isLoading={q.isLoading} subtitle={t("kpi.sharedPoolHelp")} />
          <CostKpiCard title={t("kpi.sms")} value={data && data.smsMode !== "NONE" ? formatLira(data.smsTotalTry) : "—"} icon={MessageSquareText} {...KPI_ORBS.pink} isLoading={q.isLoading} subtitle={data ? t(`smsMode.${data.smsMode}`) : undefined} />
          <CostKpiCard title={t("kpi.totalCost")} value={formatLira(data?.totalCostTry)} icon={Receipt} {...KPI_ORBS.orange} isLoading={q.isLoading} />
          <CostKpiCard title={t("kpi.revenue")} value={formatLira(data?.totalRevenueTry)} icon={Users2} {...KPI_ORBS.emerald} isLoading={q.isLoading} subtitle={t("kpi.revenueHelp")} />
        </div>
      )}

      {data && !data.smsAvailable ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {t("smsUnavailable")}
        </p>
      ) : null}
      {data && data.unallocatedTry > 0 ? (
        <p className="flex items-center gap-2 text-xs text-warning">
          <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {t("unallocated", { amount: formatLira(data.unallocatedTry) })}
        </p>
      ) : null}

      <CostPanel title={t("title", { month: formatMonth(month) })} description={t("description")} orb="vision-card-orb-teal">
        {q.isLoading && !data ? (
          <CostRowsSkeleton rows={6} />
        ) : rows.length === 0 ? (
          <CostEmptyState message={t("empty")} icon={Building2} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("table.institution")}</TableHead>
                <TableHead className="text-right">{t("table.students")}</TableHead>
                <TableHead className="text-right">{t("table.shared")}</TableHead>
                <TableHead className="text-right">{t("table.sms")}</TableHead>
                <TableHead className="text-right">{t("table.totalCost")}</TableHead>
                <TableHead className="text-right">{t("table.revenue")}</TableHead>
                <TableHead className="text-right">{t("table.margin")}</TableHead>
                <TableHead className="text-right">{t("table.perStudent")}</TableHead>
                <TableHead>{t("table.state")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="max-w-64 truncate font-medium">
                    <Link href={`/institutions/${r.id}`} className="hover:underline">
                      {r.name}
                    </Link>
                    <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t(`status.${statusOf(r)}`)}</span>
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums">{formatNumber(r.students)}</TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums">{formatLiraExact(r.sharedCostTry)}</TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums">{r.smsCostTry > 0 ? formatLiraExact(r.smsCostTry) : "—"}</TableCell>
                  <TableCell className="text-right font-mono text-xs font-medium tabular-nums">{formatLiraExact(r.totalCostTry)}</TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums">{r.revenueTry > 0 ? formatLiraExact(r.revenueTry) : "—"}</TableCell>
                  <TableCell className={`text-right font-mono text-xs tabular-nums ${r.marginTry < 0 ? "text-destructive" : ""}`}>
                    {r.revenueTry > 0 ? (
                      <>
                        {formatLiraExact(r.marginTry)} <span className="text-muted-foreground">({formatPct(r.marginPct, 0)})</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums">{r.costPerStudentTry === null ? "—" : formatLiraExact(r.costPerStudentTry)}</TableCell>
                  <TableCell>
                    <MarginBadge state={r.margin} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CostPanel>
    </div>
  );
}
