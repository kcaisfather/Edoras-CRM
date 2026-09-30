"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Megaphone } from "lucide-react";
import { useRouter } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { CoverageNote } from "@/components/ui/coverage-note";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SortableHeader, useUrlSort } from "@/components/ui/sortable-header";
import { CsvButton, DesktopTable, EmptyRow, MobileCard, MobileCardList } from "@/components/list";
import { sortRows } from "@/lib/utils/sort";
import { TOP_INSTITUTIONS_LIMIT, topInstitutions } from "@/lib/domain/growth/top";
import { TOP_SORT_KEYS, topSortAccessors } from "@/lib/domain/growth/sort";
import { toCandidate } from "@/lib/domain/growth/campaign";
import { ACTIVITY_SOURCES, type GrowthCustomer } from "@/lib/domain/growth/types";
import { CampaignDialog } from "./CampaignDialog";
import { CLICKABLE_ROW, ContactActions, CustomerCell, LastActivity, TABLE, TH, formatNumber } from "./shared";

/**
 * Sadık (Top 50): penceredeki toplam etkinliğine göre en aktif kurumlar (DeepSport TopUsersList: en çok test yapan kullanıcılar).
 * "Kampanya" düğmesi bu listeyi alıcı olarak açar (WhatsApp bağlantıları / CSV).
 */
export function TopList({ customers, windowDays }: { customers: GrowthCustomer[]; windowDays: number }) {
  const t = useTranslations("growth.topUsers");
  const ts = useTranslations("growth.sources");
  const router = useRouter();
  const [campaignOpen, setCampaignOpen] = useState(false);
  const { sort, toggle } = useUrlSort(TOP_SORT_KEYS);
  const ranked = useMemo(() => topInstitutions(customers), [customers]);
  const rows = useMemo(() => sortRows(ranked, sort, topSortAccessors()), [ranked, sort]);
  const candidates = useMemo(() => ranked.map((r) => toCandidate(r.customer)), [ranked]);

  const open = (id: string) => router.push(`/institutions/${id}`);
  const head = (key: (typeof TOP_SORT_KEYS)[number], label: string, align?: "left" | "right") => (
    <SortableHeader label={label} sortKey={key} sort={sort} onSort={toggle} className={TH} align={align} />
  );
  const sourcesText = (c: GrowthCustomer) =>
    ACTIVITY_SOURCES.filter((s) => (c.usage?.counts[s] ?? 0) > 0)
      .map((s) => ts(s))
      .join(", ");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CoverageNote>{t("note", { limit: TOP_INSTITUTIONS_LIMIT, days: windowDays })}</CoverageNote>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setCampaignOpen(true)} disabled={rows.length === 0}>
            <Megaphone />
            {t("campaign")}
          </Button>
          <CsvButton
            filename="en-aktif-kurumlar"
            header={[t("cols.rank"), t("cols.customer"), t("cols.activity", { days: windowDays }), t("cols.sources"), t("cols.lastActivity"), t("cols.students")]}
            rows={() => rows.map((r) => [r.rank, r.customer.name, r.activity, sourcesText(r.customer), r.customer.usage?.lastActivityOn, r.customer.usage?.students])}
          />
        </div>
      </div>

      <DesktopTable>
        <Table className={TABLE}>
          <TableHeader>
            <TableRow>
              <TableHead className={TH}>{t("cols.rank")}</TableHead>
              {head("customer", t("cols.customer"))}
              {head("activity", t("cols.activity", { days: windowDays }), "right")}
              {head("sources", t("cols.sources"), "right")}
              {head("lastActivity", t("cols.lastActivity"))}
              {head("students", t("cols.students"), "right")}
              <TableHead className={TH}>{t("cols.contact")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? <EmptyRow colSpan={7} /> : null}
            {rows.map((r) => (
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
                <TableCell className="tabular-nums text-muted-foreground">{r.rank}</TableCell>
                <TableCell>
                  <CustomerCell customer={r.customer} />
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{formatNumber(r.activity)}</TableCell>
                <TableCell className="text-right tabular-nums" title={sourcesText(r.customer)}>
                  {r.sources}
                </TableCell>
                <TableCell>
                  <LastActivity customer={r.customer} />
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(r.customer.usage?.students)}</TableCell>
                <TableCell>
                  <ContactActions customer={r.customer} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DesktopTable>

      <MobileCardList empty={rows.length === 0}>
        {rows.map((r) => (
          <MobileCard key={r.customer.id} className={CLICKABLE_ROW}>
            <div role="link" tabIndex={0} onClick={() => open(r.customer.id)} onKeyDown={(e) => e.key === "Enter" && open(r.customer.id)} className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <span className="flex items-start gap-2">
                  <span className="tabular-nums text-muted-foreground">{r.rank}.</span>
                  <CustomerCell customer={r.customer} />
                </span>
                <span className="font-semibold tabular-nums">{formatNumber(r.activity)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                <LastActivity customer={r.customer} />
                <span>{sourcesText(r.customer)}</span>
              </div>
              <ContactActions customer={r.customer} />
            </div>
          </MobileCard>
        ))}
      </MobileCardList>

      <CampaignDialog open={campaignOpen} onOpenChange={setCampaignOpen} candidates={candidates} />
    </div>
  );
}
