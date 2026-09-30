"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/lib/navigation";
import { Table, TableBody, TableCell, TableHeader, TableRow, TableHead } from "@/components/ui/table";
import { SortableHeader, useUrlSort } from "@/components/ui/sortable-header";
import { Money } from "@/components/ui/money";
import { CoverageNote } from "@/components/ui/coverage-note";
import { CsvButton, DesktopTable, EmptyRow, MobileCard, MobileCardList, SearchBox } from "@/components/list";
import { FinancialOnly } from "@/features/auth";
import { formatDate } from "@/features/institutions";
import { useUrlParam } from "@/lib/hooks/use-url-param";
import { cn } from "@/lib/utils";
import { balanceOf } from "@/lib/domain/growth/economics";
import {
  RENEWAL_BUCKETS,
  RENEWAL_EXPIRED_LOOKBACK_DAYS,
  RENEWAL_WINDOW_DAYS,
  RECENTLY_ACTIVE_DAYS,
  bucketTotals,
  matchesBucketFilter,
  parseBucketFilter,
  renewalRows,
  type RenewalBucket,
  type RenewalRow,
} from "@/lib/domain/growth/renewals";
import { searchCustomers } from "@/lib/domain/growth/search";
import { RENEWAL_SORT_KEYS, renewalSortAccessors } from "@/lib/domain/growth/sort";
import type { GrowthCustomer } from "@/lib/domain/growth/types";
import { sortRows } from "@/lib/utils/sort";
import { CLICKABLE_ROW, ContactActions, CustomerCell, LastActivity, StatCard, TABLE, TH, UsageBadge } from "./shared";

const BUCKET_TONE: Record<RenewalBucket, string> = {
  expiredActive: "text-destructive",
  d1_7: "text-warning",
  d8_14: "text-caution",
  d15_30: "text-foreground",
  d31_60: "text-foreground",
  expired: "text-muted-foreground",
};

/**
 * Süresi Dolacaklar (DeepSport RenewalsPage): lisansı (ya da demosu) {60} gün içinde bitecek ve son {90} günde bitmiş kurumlar,
 * kalan güne göre kovalarda. "Süresi bitmiş ama kullanan" kurum en sıcak fırsattır (kurum hâlâ Edoras kullanıyor).
 */
export function RenewalsList({ customers }: { customers: GrowthCustomer[] }) {
  const t = useTranslations("growth.renewals");
  const router = useRouter();
  const [q, setQ] = useUrlParam("q");
  const [bucketParam, setBucket] = useUrlParam("bucket", "all");
  const bucket = parseBucketFilter(bucketParam);
  const { sort, toggle } = useUrlSort(RENEWAL_SORT_KEYS);

  const all = useMemo(() => renewalRows(customers), [customers]);
  const totals = useMemo(() => bucketTotals(all), [all]);
  const rows = useMemo(() => {
    const byBucket = all.filter((r) => matchesBucketFilter(r.bucket, bucket));
    const found = new Set(searchCustomers(byBucket.map((r) => r.customer), q));
    return sortRows(
      byBucket.filter((r) => found.has(r.customer)),
      sort,
      renewalSortAccessors()
    );
  }, [all, bucket, q, sort]);

  const open = (id: string) => router.push(`/institutions/${id}`);
  const head = (key: (typeof RENEWAL_SORT_KEYS)[number], label: string) => (
    <SortableHeader label={label} sortKey={key} sort={sort} onSort={toggle} className={TH} />
  );
  const daysText = (r: RenewalRow) => (r.daysLeft > 0 ? t("daysLeft", { days: r.daysLeft }) : r.daysLeft === 0 ? t("endedToday") : t("endedAgo", { days: -r.daysLeft }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {RENEWAL_BUCKETS.map((b) => (
          <StatCard
            key={b}
            label={t(`buckets.${b}`)}
            value={totals[b]}
            tone={BUCKET_TONE[b]}
            active={bucket === b}
            onClick={() => setBucket(bucket === b ? "all" : b)}
          />
        ))}
      </div>
      <CoverageNote>{t("note", { window: RENEWAL_WINDOW_DAYS, lookback: RENEWAL_EXPIRED_LOOKBACK_DAYS, active: RECENTLY_ACTIVE_DAYS })}</CoverageNote>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <SearchBox value={q} onChange={setQ} />
          <button
            type="button"
            aria-pressed={bucket === "le60"}
            onClick={() => setBucket(bucket === "le60" ? "all" : "le60")}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              bucket === "le60" ? "border-primary/30 bg-primary/10 text-primary" : "border-border bg-card/60 text-muted-foreground hover:text-foreground"
            )}
          >
            {t("le60", { days: RENEWAL_WINDOW_DAYS })}
          </button>
        </div>
        <CsvButton
          filename="yenileme"
          header={[t("cols.customer"), t("cols.type"), t("cols.bucket"), t("cols.endsOn"), t("cols.days"), t("cols.lastActivity"), t("csvContact"), t("csvPhone"), t("csvEmail"), t("cols.balance")]}
          financialColumns={[9]}
          rows={() =>
            rows.map((r) => [
              r.customer.name,
              r.isDemo ? t("demo") : t("paid"),
              t(`buckets.${r.bucket}`),
              r.endsOn,
              r.daysLeft,
              r.customer.usage?.lastActivityOn,
              r.customer.contactName,
              r.customer.contactPhone,
              r.customer.contactEmail,
              r.customer.payments ? balanceOf(r.customer) : null,
            ])
          }
        />
      </div>

      <DesktopTable>
        <Table className={TABLE}>
          <TableHeader>
            <TableRow>
              {head("customer", t("cols.customer"))}
              {head("status", t("cols.bucket"))}
              {head("endsOn", t("cols.endsOn"))}
              {head("daysLeft", t("cols.days"))}
              {head("lastActivity", t("cols.lastActivity"))}
              <TableHead className={TH}>{t("cols.usage")}</TableHead>
              <FinancialOnly>
                <TableHead className={cn(TH, "text-right")}>{t("cols.balance")}</TableHead>
              </FinancialOnly>
              <TableHead className={TH}>{t("cols.contact")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? <EmptyRow colSpan={8} /> : null}
            {rows.map((r) => {
              const balance = balanceOf(r.customer);
              return (
                <TableRow
                  key={r.customer.id}
                  className={CLICKABLE_ROW}
                  tabIndex={0}
                  onClick={() => open(r.customer.id)}
                  onKeyDown={(e) => {
                    if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      open(r.customer.id);
                    }
                  }}
                >
                  <TableCell>
                    <span className="flex items-center gap-2">
                      <CustomerCell customer={r.customer} />
                      {r.isDemo ? (
                        <span className="rounded border border-primary/25 bg-primary/10 px-1.5 text-[10px] font-semibold text-primary">{t("demo")}</span>
                      ) : null}
                    </span>
                  </TableCell>
                  <TableCell className={cn("text-sm font-medium", BUCKET_TONE[r.bucket])}>{t(`buckets.${r.bucket}`)}</TableCell>
                  <TableCell className="text-sm tabular-nums">{formatDate(r.endsOn)}</TableCell>
                  <TableCell className="text-sm tabular-nums">{daysText(r)}</TableCell>
                  <TableCell>
                    <LastActivity customer={r.customer} />
                  </TableCell>
                  <TableCell>
                    <UsageBadge customer={r.customer} />
                  </TableCell>
                  <FinancialOnly>
                    <TableCell className="text-right tabular-nums">{balance > 0 ? <Money value={balance} /> : <span className="text-muted-foreground">—</span>}</TableCell>
                  </FinancialOnly>
                  <TableCell>
                    <ContactActions customer={r.customer} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </DesktopTable>

      <MobileCardList empty={rows.length === 0}>
        {rows.map((r) => (
          <MobileCard key={r.customer.id} className={CLICKABLE_ROW}>
            <div role="link" tabIndex={0} onClick={() => open(r.customer.id)} onKeyDown={(e) => e.key === "Enter" && open(r.customer.id)} className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <CustomerCell customer={r.customer} />
                <span className={cn("text-xs font-semibold", BUCKET_TONE[r.bucket])}>{t(`buckets.${r.bucket}`)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{formatDate(r.endsOn)} · {daysText(r)}</span>
                <LastActivity customer={r.customer} />
              </div>
              <ContactActions customer={r.customer} />
            </div>
          </MobileCard>
        ))}
      </MobileCardList>
    </div>
  );
}
