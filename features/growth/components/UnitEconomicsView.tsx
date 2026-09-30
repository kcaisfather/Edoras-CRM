"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/lib/navigation";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CoverageNote } from "@/components/ui/coverage-note";
import { Money } from "@/components/ui/money";
import { CsvButton, EmptyRow } from "@/components/list";
import { formatDate } from "@/features/institutions";
import { cn } from "@/lib/utils";
import { economicsSummary, revenueTrend, valueRows } from "@/lib/domain/growth/economics";
import type { GrowthCustomer } from "@/lib/domain/growth/types";
import { CLICKABLE_ROW, CustomerCell, LastActivity, StatCard, TABLE, TH, formatNumber } from "./shared";

/**
 * Birim ekonomisi (DeepSport G97/G98): kurum başına gelir ve tahsilat. Yalnız ADMIN (tutar). Gelir = ücretli lisans bedeli
 * (1 yıllık, 12 aya eşit yayılır); tahsilat = ödeme kayıtları. AWS maliyeti, kur ve reklam harcaması (CAC/ROAS) Edoras/CRM'de
 * olmadığı için yok.
 */
export function UnitEconomicsView({ customers }: { customers: GrowthCustomer[] }) {
  const t = useTranslations("growth.economics");
  const locale = useLocale();
  const router = useRouter();
  const summary = useMemo(() => economicsSummary(customers), [customers]);
  const trend = useMemo(() => revenueTrend(customers), [customers]);
  const value = useMemo(() => valueRows(customers), [customers]);
  const maxBar = Math.max(1, ...trend.map((m) => Math.max(m.recognized, m.collected)));
  const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString(locale, { month: "long", year: "numeric", timeZone: "UTC" });
  const atRiskValue = value.filter((r) => r.atRisk).reduce((s, r) => s + r.annualValue, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t("kpi.arr")} value={<Money value={summary.arr} />} hint={t("kpi.arrHint", { count: summary.payingCustomers })} />
        <StatCard label={t("kpi.mrr")} value={<Money value={summary.mrr} />} hint={t("kpi.mrrHint")} />
        <StatCard label={t("kpi.arpa")} value={summary.arpa == null ? "—" : <Money value={summary.arpa} />} hint={t("kpi.arpaHint")} />
        <StatCard
          label={t("kpi.collection")}
          value={summary.collection ? `%${Math.round((summary.collection.count / summary.collection.of) * 100)}` : "—"}
          hint={<Money value={summary.outstanding} className="text-[11px]" />}
          tone={summary.outstanding > 0 ? "text-warning" : undefined}
        />
        <StatCard label={t("kpi.atRisk")} value={<Money value={atRiskValue} />} hint={t("kpi.atRiskHint", { count: value.filter((r) => r.atRisk).length })} tone={atRiskValue > 0 ? "text-destructive" : undefined} />
        <StatCard
          label={t("kpi.free")}
          value={summary.freeShare.of ? `%${Math.round((summary.freeShare.count / summary.freeShare.of) * 100)}` : "—"}
          hint={`${summary.freeShare.count}/${summary.freeShare.of}`}
        />
      </div>
      <CoverageNote>{t("note")}</CoverageNote>

      <section className="rounded-2xl border border-border/60 bg-card/60 p-4">
        <h3 className="mb-3 text-sm font-semibold">{t("trend.title")}</h3>
        <div className="overflow-x-auto">
          <Table className={TABLE}>
            <TableHeader>
              <TableRow>
                <TableHead className={TH}>{t("trend.month")}</TableHead>
                <TableHead className={cn(TH, "text-right")}>{t("trend.recognized")}</TableHead>
                <TableHead className={cn(TH, "text-right")}>{t("trend.collected")}</TableHead>
                <TableHead className={TH}>{t("trend.bars")}</TableHead>
                <TableHead className={cn(TH, "text-right")}>{t("trend.newCustomers")}</TableHead>
                <TableHead className={cn(TH, "text-right")}>{t("trend.newRevenue")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...trend].reverse().map((m) => (
                <TableRow key={m.month}>
                  <TableCell>{monthLabel(m.month)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    <Money value={m.recognized} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <Money value={m.collected} />
                  </TableCell>
                  <TableCell className="w-40">
                    <span className="block space-y-1" aria-hidden>
                      <span className="block h-1.5 rounded-full bg-primary" style={{ width: `${(m.recognized / maxBar) * 100}%` }} />
                      <span className="block h-1.5 rounded-full bg-success" style={{ width: `${(m.collected / maxBar) * 100}%` }} />
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{m.newCustomers}</TableCell>
                  <TableCell className="text-right tabular-nums">{m.newRevenue ? <Money value={m.newRevenue} /> : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-2 w-2 rounded-sm bg-primary" />
            {t("trend.recognized")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-2 w-2 rounded-sm bg-success" />
            {t("trend.collected")}
          </span>
        </p>
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">{t("value.title")}</h3>
          <CsvButton
            filename="musteri-degeri"
            header={[t("value.customer"), t("value.annual"), t("value.paid"), t("value.balance"), t("value.activity"), t("value.lastActivity"), t("value.risk")]}
            rows={() => value.map((r) => [r.customer.name, r.annualValue, r.paid, r.balance, r.activity, r.customer.usage?.lastActivityOn, r.atRisk ? t("value.yes") : ""])}
          />
        </div>
        <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/60">
          <Table className={TABLE}>
            <TableHeader>
              <TableRow>
                <TableHead className={TH}>{t("value.customer")}</TableHead>
                <TableHead className={cn(TH, "text-right")}>{t("value.annual")}</TableHead>
                <TableHead className={cn(TH, "text-right")}>{t("value.paid")}</TableHead>
                <TableHead className={cn(TH, "text-right")}>{t("value.balance")}</TableHead>
                <TableHead className={cn(TH, "text-right")}>{t("value.activity")}</TableHead>
                <TableHead className={TH}>{t("value.lastActivity")}</TableHead>
                <TableHead className={TH}>{t("value.endsOn")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {value.length === 0 ? <EmptyRow colSpan={7} /> : null}
              {value.map((r) => (
                <TableRow
                  key={r.customer.id}
                  className={cn(CLICKABLE_ROW, r.atRisk && "bg-destructive/5")}
                  tabIndex={0}
                  onClick={() => router.push(`/institutions/${r.customer.id}`)}
                  onKeyDown={(e) => {
                    if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      router.push(`/institutions/${r.customer.id}`);
                    }
                  }}
                >
                  <TableCell>
                    <CustomerCell customer={r.customer} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <Money value={r.annualValue} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <Money value={r.paid} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.balance > 0 ? <Money value={r.balance} className="text-warning" /> : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(r.activity)}</TableCell>
                  <TableCell>
                    <LastActivity customer={r.customer} />
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">{formatDate(r.customer.licenseEndsOn)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <CoverageNote>{t("value.note")}</CoverageNote>
      </section>
    </div>
  );
}
