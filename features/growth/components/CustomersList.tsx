"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/lib/navigation";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SortableHeader, useUrlSort } from "@/components/ui/sortable-header";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Money } from "@/components/ui/money";
import { CsvButton, DesktopTable, EmptyRow, MobileCard, MobileCardList, SearchBox } from "@/components/list";
import { FinancialOnly, usePermissions } from "@/features/auth";
import { formatDate, useStatusLabel } from "@/features/institutions";
import { useUrlParam } from "@/lib/hooks/use-url-param";
import { todayIso } from "@/lib/domain/institutions/rules";
import { balanceOf } from "@/lib/domain/growth/economics";
import { customerStatusInfo } from "@/lib/domain/growth/status";
import { searchCustomers } from "@/lib/domain/growth/search";
import { CUSTOMER_SORT_KEYS, customerSortAccessors, guardFinancialSort } from "@/lib/domain/growth/sort";
import { renewalEndsOn } from "@/lib/domain/growth/renewals";
import { totalActivity } from "@/lib/domain/growth/usage";
import type { GrowthCustomer } from "@/lib/domain/growth/types";
import { sortRows } from "@/lib/utils/sort";
import { CLICKABLE_ROW, ContactActions, CustomerCell, CustomerStatusBadge, LastActivity, TABLE, TH, UsageBadge, formatNumber } from "./shared";

/** Tür süzgeci: ücretli, demo, kayıtsız (CRM kaydı yok) ya da hepsi. */
const KINDS = ["all", "paid", "demo", "unregistered"] as const;
type Kind = (typeof KINDS)[number];

function matchesKind(c: GrowthCustomer, kind: Kind): boolean {
  switch (kind) {
    case "all":
      return true;
    case "paid":
      return c.status === "UCRETLI";
    case "demo":
      return c.status === "DEMO";
    case "unregistered":
      return c.status === null;
  }
}

/**
 * Müşteri listesi (DeepSport ActiveCustomersPage): arama, tür süzgeci, sıralanabilir sütunlar, CSV; satır kurum ayrıntısına
 * gider. CRM_AGENT'ta bakiye sütunu yok (sunucu ödemeleri boşaltır; sıralama da yok sayılır).
 */
export function CustomersList({ rows: all, windowDays }: { rows: GrowthCustomer[]; windowDays: number }) {
  const t = useTranslations("growth.active");
  const tc = useTranslations("growth.common");
  const router = useRouter();
  const statusLabel = useStatusLabel();
  const { canSeeFinancials } = usePermissions();
  const [q, setQ] = useUrlParam("q");
  const [kindParam, setKind] = useUrlParam("kind", "all");
  const kind: Kind = (KINDS as readonly string[]).includes(kindParam) ? (kindParam as Kind) : "all";
  const { sort, toggle } = useUrlSort(CUSTOMER_SORT_KEYS);
  const today = todayIso();

  const rows = useMemo(() => {
    const byKind = all.filter((c) => matchesKind(c, kind));
    const found = searchCustomers(byKind, q);
    const accessors = customerSortAccessors({ statusLabel: (c) => statusLabel(customerStatusInfo(c, today)) });
    return sortRows(found, guardFinancialSort(sort, canSeeFinancials), accessors);
  }, [all, kind, q, sort, canSeeFinancials, statusLabel, today]);

  const open = (id: string) => router.push(`/institutions/${id}`);
  const head = (key: (typeof CUSTOMER_SORT_KEYS)[number], label: string, align?: "left" | "right") => (
    <SortableHeader label={label} sortKey={key} sort={sort} onSort={toggle} className={TH} align={align} />
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <SearchBox value={q} onChange={setQ} />
          <SegmentedControl<Kind>
            value={kind}
            onValueChange={setKind}
            aria-label={t("kindLabel")}
            options={KINDS.map((k) => ({ value: k, label: `${t(`kinds.${k}`)} ${all.filter((c) => matchesKind(c, k)).length}` }))}
          />
        </div>
        <CsvButton
          filename="musteriler"
          header={[
            tc("csv.name"),
            tc("csv.status"),
            tc("csv.endsOn"),
            tc("csv.students"),
            tc("csv.teachers"),
            tc("csv.activeTeachers"),
            tc("csv.activity", { days: windowDays }),
            tc("csv.lastActivity"),
            tc("csv.contact"),
            tc("csv.phone"),
            tc("csv.email"),
            tc("csv.balance"),
          ]}
          financialColumns={[11]}
          rows={() =>
            rows.map((c) => [
              c.name,
              statusLabel(customerStatusInfo(c, today)),
              renewalEndsOn(c),
              c.usage?.students,
              c.usage?.teachers,
              c.usage?.activeTeachers,
              c.usage ? totalActivity(c.usage.counts) : null,
              c.usage?.lastActivityOn,
              c.contactName,
              c.contactPhone,
              c.contactEmail,
              c.payments ? balanceOf(c) : null,
            ])
          }
        />
      </div>

      <DesktopTable>
        <Table className={TABLE}>
          <TableHeader>
            <TableRow>
              {head("customer", t("cols.customer"))}
              {head("status", t("cols.status"))}
              {head("students", t("cols.students"), "right")}
              {head("activeTeachers", t("cols.teachers"), "right")}
              {head("activity", t("cols.activity", { days: windowDays }), "right")}
              {head("lastActivity", t("cols.lastActivity"))}
              {head("usage", t("cols.usage"))}
              {head("endsOn", t("cols.endsOn"))}
              <FinancialOnly>{head("balance", t("cols.balance"), "right")}</FinancialOnly>
              <TableHead className={TH}>{t("cols.contact")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? <EmptyRow colSpan={10} /> : null}
            {rows.map((c) => {
              const balance = balanceOf(c, today);
              return (
                <TableRow
                  key={c.id}
                  className={CLICKABLE_ROW}
                  tabIndex={0}
                  onClick={() => open(c.id)}
                  onKeyDown={(e) => {
                    if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      open(c.id);
                    }
                  }}
                >
                  <TableCell>
                    <CustomerCell customer={c} />
                  </TableCell>
                  <TableCell>
                    <CustomerStatusBadge customer={c} today={today} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(c.usage?.students)}</TableCell>
                  <TableCell className="text-right tabular-nums" title={t("teachersHint")}>
                    {c.usage ? `${c.usage.activeTeachers == null ? "—" : `${c.usage.activeTeachersLowerBound ? "≥" : ""}${c.usage.activeTeachers}`} / ${c.usage.teachers}` : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{c.usage ? formatNumber(totalActivity(c.usage.counts)) : "—"}</TableCell>
                  <TableCell>
                    <LastActivity customer={c} />
                  </TableCell>
                  <TableCell>
                    <UsageBadge customer={c} />
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">{formatDate(renewalEndsOn(c))}</TableCell>
                  <FinancialOnly>
                    <TableCell className="text-right tabular-nums">{balance > 0 ? <Money value={balance} /> : <span className="text-muted-foreground">—</span>}</TableCell>
                  </FinancialOnly>
                  <TableCell>
                    <ContactActions customer={c} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </DesktopTable>

      <MobileCardList empty={rows.length === 0}>
        {rows.map((c) => (
          <MobileCard key={c.id} className={CLICKABLE_ROW}>
            <div role="link" tabIndex={0} onClick={() => open(c.id)} onKeyDown={(e) => e.key === "Enter" && open(c.id)} className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <CustomerCell customer={c} />
                <CustomerStatusBadge customer={c} today={today} />
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <UsageBadge customer={c} />
                <LastActivity customer={c} />
                <span>{t("cols.students")}: {formatNumber(c.usage?.students)}</span>
                <span>{t("cols.endsOn")}: {formatDate(renewalEndsOn(c))}</span>
              </div>
              <ContactActions customer={c} />
            </div>
          </MobileCard>
        ))}
      </MobileCardList>
    </div>
  );
}
