"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { Link, useRouter } from "@/lib/navigation";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CoverageNote } from "@/components/ui/coverage-note";
import { Money } from "@/components/ui/money";
import { CsvButton, DesktopTable, EmptyRow, MobileCard, MobileCardList, SearchBox } from "@/components/list";
import { FinancialOnly } from "@/features/auth";
import { formatDate } from "@/features/institutions";
import { useUrlParam } from "@/lib/hooks/use-url-param";
import { cn } from "@/lib/utils";
import { LEAK_BUCKETS, giftRatio, leakageItems, type LeakBucket } from "@/lib/domain/growth/economics";
import { searchCustomers } from "@/lib/domain/growth/search";
import type { GrowthCustomer } from "@/lib/domain/growth/types";
import { CLICKABLE_ROW, ContactActions, CustomerCell, StatCard, TABLE, TH } from "./shared";

type BucketFilter = LeakBucket | "all";

/**
 * Gelir sızıntısı (DeepSport G27): bedelsiz lisans (hediye) ve eksik tahsilat. "Süresi bitmiş ama kullanan" kurumlar
 * Müşteri Takibi → Süresi Dolacaklar'da (bağlantı). Tutarlar yalnız ADMIN'e (sunucu ödemeleri/bedelleri boşaltır).
 */
export function LeakageView({ customers }: { customers: GrowthCustomer[] }) {
  const t = useTranslations("growth.leakage");
  const router = useRouter();
  const [bucketParam, setBucket] = useUrlParam("lb", "all");
  const [q, setQ] = useUrlParam("q");
  const bucket = (["all", ...LEAK_BUCKETS] as string[]).includes(bucketParam) ? (bucketParam as BucketFilter) : "all";

  const { items, gift } = useMemo(() => {
    const now = new Date();
    return { items: leakageItems(customers, now), gift: giftRatio(customers, now) };
  }, [customers]);

  const stat = (f: BucketFilter) => {
    const list = f === "all" ? items : items.filter((i) => i.bucket === f);
    return { count: list.length, loss: list.reduce((s, i) => s + (i.loss ?? 0), 0) };
  };
  const visible = useMemo(() => {
    const byBucket = items.filter((i) => bucket === "all" || i.bucket === bucket);
    const found = new Set(searchCustomers(byBucket.map((i) => i.customer), q));
    return byBucket.filter((i) => found.has(i.customer));
  }, [items, bucket, q]);
  const open = (id: string) => router.push(`/institutions/${id}`);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {LEAK_BUCKETS.map((b) => {
          const s = stat(b);
          return (
            <StatCard
              key={b}
              label={t(`buckets.${b}`)}
              value={
                <>
                  {s.count}
                  <FinancialOnly>
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      <Money value={s.loss} />
                    </span>
                  </FinancialOnly>
                </>
              }
              active={bucket === b}
              onClick={() => setBucket(bucket === b ? "all" : b)}
            />
          );
        })}
        <StatCard label={t("giftRatio")} value={gift.of ? `%${Math.round((gift.count / gift.of) * 100)} (${gift.count}/${gift.of})` : "—"} />
        {/* Süresi bitmiş ama kullananların tek yeri Süresi Dolacaklar. */}
        <Link
          href="/growth/customers?tab=renewals&bucket=expiredActive"
          className="glass-panel flex items-center justify-between gap-2 rounded-2xl px-4 py-3 text-sm transition-colors hover:bg-accent/40"
        >
          <span className="text-muted-foreground">{t("expiredActiveLink")}</span>
          <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
        </Link>
      </div>
      <CoverageNote>{t("note")}</CoverageNote>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <SearchBox value={q} onChange={setQ} />
        <CsvButton
          filename="gelir-sizintisi"
          header={[t("cols.customer"), t("cols.bucket"), t("cols.date"), t("cols.contact"), t("cols.phone"), t("cols.loss")]}
          financialColumns={[5]}
          rows={() => visible.map((i) => [i.customer.name, t(`buckets.${i.bucket}`), i.date, i.customer.contactName, i.customer.contactPhone, i.loss == null ? null : Math.round(i.loss)])}
        />
      </div>

      <DesktopTable>
        <Table className={TABLE}>
          <TableHeader>
            <TableRow>
              <TableHead className={TH}>{t("cols.customer")}</TableHead>
              <TableHead className={TH}>{t("cols.bucket")}</TableHead>
              <TableHead className={TH}>{t("cols.date")}</TableHead>
              <FinancialOnly>
                <TableHead className={cn(TH, "text-right")}>{t("cols.loss")}</TableHead>
              </FinancialOnly>
              <TableHead className={TH}>{t("cols.contact")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? <EmptyRow colSpan={5} /> : null}
            {visible.map((i) => (
              <TableRow
                key={i.key}
                className={CLICKABLE_ROW}
                tabIndex={0}
                onClick={() => open(i.customer.id)}
                onKeyDown={(e) => {
                  if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    open(i.customer.id);
                  }
                }}
              >
                <TableCell>
                  <CustomerCell customer={i.customer} />
                </TableCell>
                <TableCell className="text-sm">{t(`buckets.${i.bucket}`)}</TableCell>
                <TableCell className="text-sm tabular-nums">{formatDate(i.date)}</TableCell>
                <FinancialOnly>
                  <TableCell className="text-right tabular-nums">{i.loss == null ? "—" : <Money value={i.loss} />}</TableCell>
                </FinancialOnly>
                <TableCell>
                  <ContactActions customer={i.customer} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DesktopTable>

      <MobileCardList empty={visible.length === 0}>
        {visible.map((i) => (
          <MobileCard key={i.key} className={CLICKABLE_ROW}>
            <div role="link" tabIndex={0} onClick={() => open(i.customer.id)} onKeyDown={(e) => e.key === "Enter" && open(i.customer.id)} className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <CustomerCell customer={i.customer} />
                <span className="text-xs text-muted-foreground">{t(`buckets.${i.bucket}`)}</span>
              </div>
              <FinancialOnly>{i.loss == null ? null : <Money value={i.loss} className="text-sm font-semibold" />}</FinancialOnly>
              <ContactActions customer={i.customer} />
            </div>
          </MobileCard>
        ))}
      </MobileCardList>
    </div>
  );
}
