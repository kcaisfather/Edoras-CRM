"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CoverageNote } from "@/components/ui/coverage-note";
import { InfoTip } from "@/components/ui/info-tip";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryErrorState } from "@/components/query-error-state";
import { formatDate } from "@/features/institutions";
import { cn } from "@/lib/utils";
import { segmentCounts } from "@/lib/domain/growth/segments";
import { ACTIVITY_BUCKETS, NEVER_ACTIVATED_MIN_AGE_DAYS, USING_DAYS, bucketCounts, isUsing, totalActivity } from "@/lib/domain/growth/usage";
import { weeklySummary } from "@/lib/domain/growth/weekly";
import { ACTIVITY_SOURCES, type GrowthCustomer } from "@/lib/domain/growth/types";
import { useWeeklyActivity } from "../queries";
import { StatCard, TABLE, TH, formatNumber } from "./shared";

const BUCKET_COLOR: Record<(typeof ACTIVITY_BUCKETS)[number], string> = {
  d7: "bg-success",
  d14: "bg-success/60",
  d30: "bg-caution",
  d90: "bg-warning",
  older: "bg-destructive/70",
  never: "bg-muted-foreground/40",
};

/**
 * Kullanım bölümü (DeepSport "Kullanım" + haftalık büyüme): kullanan / kullanmayan kurum, son etkinlik dağılımı, kaynak
 * bazında etkinlik ve (açılınca yüklenen) haftalık aktif kurum tablosu.
 */
export function UsageSection({ customers, windowDays }: { customers: GrowthCustomer[]; windowDays: number }) {
  const t = useTranslations("growth.usage");
  const ts = useTranslations("growth.sources");
  const withUsage = useMemo(() => customers.filter((c) => c.usage), [customers]);

  const stats = useMemo(() => {
    const now = new Date();
    const using = withUsage.filter((c) => isUsing(c.usage, now)).length;
    const buckets = bucketCounts(withUsage, now);
    const segs = segmentCounts(customers, now);
    let activeTeachers = 0;
    let teachers = 0;
    let activity = 0;
    for (const c of withUsage) {
      const u = c.usage!;
      activeTeachers += u.activeTeachers ?? 0;
      teachers += u.teachers;
      activity += totalActivity(u.counts);
    }
    const bySource = ACTIVITY_SOURCES.map((s) => ({
      source: s,
      records: withUsage.reduce((sum, c) => sum + (c.usage?.counts[s] ?? 0), 0),
      institutions: withUsage.filter((c) => (c.usage?.counts[s] ?? 0) > 0).length,
      unavailable: withUsage.filter((c) => c.usage?.unavailable.includes(s)).length,
    }));
    return { using, notUsing: withUsage.length - using, buckets, never: segs.neverActivated, activeTeachers, teachers, activity, bySource };
  }, [customers, withUsage]);

  const pct = (n: number, d: number) => (d ? `%${Math.round((n / d) * 100)}` : "—");
  const maxBucket = Math.max(1, ...ACTIVITY_BUCKETS.map((b) => stats.buckets[b]));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label={t("metrics.using", { days: USING_DAYS })} value={stats.using} hint={pct(stats.using, withUsage.length)} tone="text-success" />
        <StatCard label={t("metrics.notUsing")} value={stats.notUsing} hint={pct(stats.notUsing, withUsage.length)} />
        <StatCard label={t("metrics.never", { days: NEVER_ACTIVATED_MIN_AGE_DAYS })} value={stats.never} />
        <StatCard label={t("metrics.activeTeachers", { days: windowDays })} value={`${formatNumber(stats.activeTeachers)} / ${formatNumber(stats.teachers)}`} hint={t("metrics.activeTeachersHint")} />
        <StatCard label={t("metrics.activity", { days: windowDays })} value={formatNumber(stats.activity)} hint={t("metrics.activityHint", { avg: withUsage.length ? Math.round(stats.activity / withUsage.length) : 0 })} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-border/60 bg-card/60 p-4">
          <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
            {t("distribution.title")}
            <InfoTip label={t("distribution.title")} align="start">
              {t("distribution.def")}
            </InfoTip>
          </h3>
          <ul className="space-y-2">
            {ACTIVITY_BUCKETS.map((b) => (
              <li key={b} className="grid grid-cols-[7.5rem_1fr_2.5rem] items-center gap-2 text-sm">
                <span className="text-muted-foreground">{t(`distribution.buckets.${b}`)}</span>
                <span className="h-2.5 overflow-hidden rounded-full bg-muted">
                  <span className={cn("block h-full rounded-full", BUCKET_COLOR[b])} style={{ width: `${(stats.buckets[b] / maxBucket) * 100}%` }} />
                </span>
                <span className="text-right tabular-nums">{stats.buckets[b]}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-border/60 bg-card/60 p-4">
          <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
            {t("sources.title", { days: windowDays })}
            <InfoTip label={t("sources.title", { days: windowDays })} align="start">
              {t("sources.def")}
            </InfoTip>
          </h3>
          <Table className="min-w-max">
            <TableHeader>
              <TableRow>
                <TableHead className={TH}>{t("sources.source")}</TableHead>
                <TableHead className={cn(TH, "text-right")}>{t("sources.records")}</TableHead>
                <TableHead className={cn(TH, "text-right")}>{t("sources.institutions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.bySource.map((r) => (
                <TableRow key={r.source}>
                  <TableCell>
                    {ts(r.source)}
                    {r.unavailable > 0 ? <span className="ml-2 text-xs text-warning">{t("sources.unavailable", { count: r.unavailable })}</span> : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(r.records)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.institutions} <span className="text-xs text-muted-foreground">{pct(r.institutions, withUsage.length)}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      </div>

      <CoverageNote>{t("caveats")}</CoverageNote>
      <WeeklySection />
    </div>
  );
}

/** Haftalık büyüme (DeepSport G30) — ağır istek: bölüm açılınca çekilir. */
function WeeklySection() {
  const t = useTranslations("growth.usage.weekly");
  const [open, setOpen] = useState(false);
  const query = useWeeklyActivity(open);
  const rows = useMemo(() => (query.data ? weeklySummary(query.data.byInstitution, query.data.weeks) : []), [query.data]);
  return (
    <details className="group rounded-2xl border border-border/60 bg-card/40 p-4" onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer select-none text-sm font-semibold">{t("title")}</summary>
      <div className="mt-4 space-y-3">
        {!open ? null : query.isLoading ? (
          <Skeleton className="h-40 w-full rounded-xl" />
        ) : query.isError ? (
          <QueryErrorState onRetry={() => query.refetch()} />
        ) : (
          <>
            <Table className={TABLE}>
              <TableHeader>
                <TableRow>
                  <TableHead className={TH}>{t("cols.week")}</TableHead>
                  <TableHead className={cn(TH, "text-right")}>{t("cols.active")}</TableHead>
                  <TableHead className={cn(TH, "text-right")}>{t("cols.new")}</TableHead>
                  <TableHead className={cn(TH, "text-right")}>{t("cols.returning")}</TableHead>
                  <TableHead className={cn(TH, "text-right")}>{t("cols.lost")}</TableHead>
                  <TableHead className={cn(TH, "text-right")}>{t("cols.total")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...rows].reverse().map((r, i) => (
                  <TableRow key={r.week}>
                    <TableCell className="tabular-nums">
                      {formatDate(r.week)}
                      {i === 0 ? <span className="ml-2 text-xs text-muted-foreground">{t("currentWeek")}</span> : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.active}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.newlyActive}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.returning}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.lost}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(r.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <CoverageNote>{query.data?.truncated ? t("truncated") : t("note")}</CoverageNote>
          </>
        )}
      </div>
    </details>
  );
}
