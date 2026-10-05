"use client";

/**
 * Satış Performansı: seçili dönemde kişi başına yeni aday, arama (konuşulan oranı), not, teklif, satış, tahsilat,
 * randevu ve açık görevler. ADMIN herkesi ve tutarları görür; CRM_AGENT yalnız kendi satırını (tutarsız) görür —
 * bu sunucuda uygulanır, burada yalnız `financial` bayrağına göre sütunlar gizlenir.
 */
import { useTranslations } from "next-intl";
import { Download } from "lucide-react";
import { PeriodPicker } from "@/components/period-picker";
import { Button } from "@/components/ui/button";
import { Money } from "@/components/ui/money";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { QueryErrorState } from "@/components/query-error-state";
import { csvCell, rate, type PerfMetrics } from "@/lib/domain/performance/aggregate";
import { usePerformance } from "../queries";

const pct = (r: number | null) => (r == null ? "—" : `${Math.round(r * 100)}%`);

function Amount({ value }: { value: number }) {
  return value ? <Money value={value} /> : <span className="text-muted-foreground">—</span>;
}

function Cells({ m, financial }: { m: PerfMetrics; financial: boolean }) {
  return (
    <>
      <TableCell className="text-right tabular-nums">{m.newLeads}</TableCell>
      <TableCell className="text-right tabular-nums">
        {m.calls}
        <span className="ml-1 text-xs text-muted-foreground">({pct(rate(m.reached, m.calls))})</span>
      </TableCell>
      <TableCell className="text-right tabular-nums">{m.notes}</TableCell>
      <TableCell className="text-right tabular-nums">
        {m.offersCount}
        {financial && m.offersAmount > 0 && (
          <span className="ml-1 text-xs text-muted-foreground">
            <Money value={m.offersAmount} />
          </span>
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {m.salesCount}
        <span className="ml-1 text-xs text-muted-foreground">({pct(rate(m.salesCount, m.offersCount))})</span>
      </TableCell>
      {financial && (
        <TableCell className="text-right tabular-nums">
          <Amount value={m.salesAmount} />
        </TableCell>
      )}
      {financial && (
        <TableCell className="text-right tabular-nums">
          {m.collectionsCount}
          <span className="ml-1 text-xs text-muted-foreground">
            <Amount value={m.collectionsAmount} />
          </span>
        </TableCell>
      )}
      <TableCell className="text-right tabular-nums">
        {m.appointmentsHeld}/{m.appointmentsPlanned}
        {m.appointmentsNoShow > 0 && <span className="ml-1 text-xs text-destructive">−{m.appointmentsNoShow}</span>}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {m.tasksOpen}
        {m.tasksOverdue > 0 && <span className="ml-1 text-xs text-destructive">({m.tasksOverdue})</span>}
      </TableCell>
    </>
  );
}

export function SalesPerformance() {
  const t = useTranslations("crm.performance");
  const q = usePerformance();
  const data = q.data;

  const exportCsv = () => {
    if (!data) return;
    const head = [
      t("cols.name"),
      t("cols.newLeads"),
      t("cols.calls"),
      t("cols.reached"),
      t("cols.notes"),
      t("cols.offers"),
      t("cols.sales"),
      ...(data.financial ? [t("cols.offersAmount"), t("cols.salesAmount"), t("cols.collectionsCount"), t("cols.collectionsAmount")] : []),
      t("cols.appointmentsPlanned"),
      t("cols.appointmentsHeld"),
      t("cols.appointmentsNoShow"),
      t("cols.tasksOpen"),
      t("cols.tasksOverdue"),
    ];
    const line = (name: string, m: PerfMetrics) =>
      [
        name,
        m.newLeads,
        m.calls,
        m.reached,
        m.notes,
        m.offersCount,
        m.salesCount,
        ...(data.financial ? [m.offersAmount, m.salesAmount, m.collectionsCount, m.collectionsAmount] : []),
        m.appointmentsPlanned,
        m.appointmentsHeld,
        m.appointmentsNoShow,
        m.tasksOpen,
        m.tasksOverdue,
      ]
        .map(csvCell)
        .join(";");
    const csv = [head.map(csvCell).join(";"), ...data.rows.map((r) => line(r.name, r.metrics)), line(t("total"), data.totals)].join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `satis-performansi-${data.range.from}_${data.range.to}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <PeriodPicker defaultPeriod="month" />
        <Button size="sm" variant="outline" onClick={exportCsv} disabled={!data || data.rows.length === 0}>
          <Download />
          {t("export")}
        </Button>
      </div>

      {q.isLoading ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : q.isError || !data ? (
        <QueryErrorState onRetry={() => void q.refetch()} />
      ) : data.rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border/60 bg-card/60">
          <Table className="[&_td]:whitespace-nowrap [&_th]:whitespace-nowrap [&_thead_tr]:bg-muted/40">
            <TableHeader>
              <TableRow>
                <TableHead>{t("cols.name")}</TableHead>
                <TableHead className="text-right">{t("cols.newLeads")}</TableHead>
                <TableHead className="text-right">{t("cols.callsReached")}</TableHead>
                <TableHead className="text-right">{t("cols.notes")}</TableHead>
                <TableHead className="text-right">{t("cols.offers")}</TableHead>
                <TableHead className="text-right">{t("cols.sales")}</TableHead>
                {data.financial && <TableHead className="text-right">{t("cols.salesAmount")}</TableHead>}
                {data.financial && <TableHead className="text-right">{t("cols.collections")}</TableHead>}
                <TableHead className="text-right">{t("cols.appointments")}</TableHead>
                <TableHead className="text-right">{t("cols.tasks")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((r) => (
                <TableRow key={r.userId}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <Cells m={r.metrics} financial={data.financial} />
                </TableRow>
              ))}
            </TableBody>
            {data.rows.length > 1 && (
              <TableFooter>
                <TableRow>
                  <TableCell className="font-semibold">{t("total")}</TableCell>
                  <Cells m={data.totals} financial={data.financial} />
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{t("legend")}</p>
    </div>
  );
}
