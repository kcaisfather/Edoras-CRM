"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/lib/navigation";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SortableHeader, useUrlSort } from "@/components/ui/sortable-header";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { CsvButton } from "@/components/list";
import { FinancialOnly } from "@/features/auth";
import { sortRows } from "@/lib/utils/sort";
import { cn } from "@/lib/utils";
import { groupSalesByCustomer, groupSalesByMonth, type SalesGroup } from "@/lib/domain/crm/sales-aggregate";
import type { CrmLead } from "@/lib/domain/crm/types";
import { formatCrmDate, formatCurrency } from "@/lib/domain/crm/utils";

export type SalesBreakdownView = "month" | "customer";
const VIEWS: SalesBreakdownView[] = ["month", "customer"];
const SORT_KEYS = ["label", "count", "amount", "collected", "balance", "last"] as const;
const MONTH = new Intl.DateTimeFormat("tr-TR", { month: "long", year: "numeric" });

/**
 * Satış kırılımları (Aylık / Müşteri): adet, ciro, tahsil edilen, kalan bakiye (+ müşteride son satış).
 * `leads` dönem süzgecinden geçmiş olarak verilir; satış sayılmayan adaylar burada atlanır. Sıralama URL'de
 * `?bsort=&bdir=`. Tutarlar yalnız finansal yetkiyle. (DeepSport'un "Ürün" kırılımı yok: tek ürün, 1 yıllık lisans.)
 */
export function CrmSalesBreakdowns({
  leads,
  defaultView = "month",
  className,
}: {
  leads: ReadonlyArray<CrmLead>;
  defaultView?: SalesBreakdownView;
  className?: string;
}) {
  const t = useTranslations("crm.breakdowns");
  const [view, setView] = useState<SalesBreakdownView>(defaultView);
  const { sort, toggle } = useUrlSort(SORT_KEYS, "bsort", "bdir");

  const labelOf = useCallback(
    (g: SalesGroup) => {
      if (view === "month") {
        if (!g.key) return t("noDate");
        const [y, m] = g.key.split("-").map(Number);
        return MONTH.format(new Date(y, m - 1, 1));
      }
      return g.label || "—";
    },
    [view, t]
  );

  const groups = useMemo(() => {
    const base = view === "month" ? groupSalesByMonth(leads) : groupSalesByCustomer(leads);
    return sortRows(base, sort, {
      // Ayda "etiket" sıralaması anahtara göre (kronolojik), müşteride görünen ada göre.
      label: (g) => (view === "month" ? g.key : labelOf(g)),
      count: (g) => g.count,
      amount: (g) => g.amount,
      collected: (g) => g.collected,
      balance: (g) => g.balance,
      last: (g) => g.lastDate,
    });
  }, [view, leads, sort, labelOf]);

  const header = [t(`headers.${view}`), t("count"), t("amount"), t("collected"), t("balance"), ...(view === "customer" ? [t("last")] : [])];

  return (
    <section className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegmentedControl<SalesBreakdownView>
          value={view}
          onValueChange={setView}
          aria-label={t("label")}
          options={VIEWS.map((v) => ({ value: v, label: t(`views.${v}`) }))}
        />
        <CsvButton
          filename={`satis-${view}`}
          header={header}
          financialColumns={[2, 3, 4]}
          rows={() =>
            groups.map((g) => [labelOf(g), g.count, g.amount, g.collected, g.balance, ...(view === "customer" ? [formatCrmDate(g.lastDate)] : [])])
          }
        />
      </div>
      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/60">
        <div className="w-full overflow-x-auto">
          <Table className="[&_thead_tr]:bg-muted/40">
            <TableHeader>
              <TableRow>
                <SortableHeader label={t(`headers.${view}`)} sortKey="label" sort={sort} onSort={toggle} />
                <SortableHeader label={t("count")} sortKey="count" sort={sort} onSort={toggle} align="right" />
                <SortableHeader label={t("amount")} sortKey="amount" sort={sort} onSort={toggle} align="right" />
                <SortableHeader label={t("collected")} sortKey="collected" sort={sort} onSort={toggle} align="right" />
                <SortableHeader label={t("balance")} sortKey="balance" sort={sort} onSort={toggle} align="right" />
                {view === "customer" && <SortableHeader label={t("last")} sortKey="last" sort={sort} onSort={toggle} />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    {t("empty")}
                  </TableCell>
                </TableRow>
              ) : (
                groups.map((g) => (
                  <TableRow key={g.key || "none"}>
                    <TableCell>
                      <div className="flex flex-col">
                        {view === "customer" && g.institutionId ? (
                          <Link href={`/institutions/${g.institutionId}`} className="font-medium hover:underline">
                            {labelOf(g)}
                          </Link>
                        ) : (
                          <span className="font-medium">{labelOf(g)}</span>
                        )}
                        {view === "customer" && g.sublabel && <span className="text-xs text-muted-foreground">{g.sublabel}</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{g.count}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      <FinancialOnly fallback="—">{formatCurrency(g.amount)}</FinancialOnly>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <FinancialOnly fallback="—">{formatCurrency(g.collected)}</FinancialOnly>
                    </TableCell>
                    <TableCell className={cn("text-right tabular-nums", g.balance > 0 && "text-destructive")}>
                      <FinancialOnly fallback="—">{formatCurrency(g.balance)}</FinancialOnly>
                    </TableCell>
                    {view === "customer" && <TableCell className="tabular-nums">{formatCrmDate(g.lastDate)}</TableCell>}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </section>
  );
}
