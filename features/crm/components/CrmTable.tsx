"use client";

import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SortableHeader } from "@/components/ui/sortable-header";
import { Money } from "@/components/ui/money";
import { usePermissions } from "@/features/auth";
import type { SortState } from "@/lib/utils/sort";
import { leadBalance } from "@/lib/domain/crm/signals";
import type { CrmSortKey } from "@/lib/domain/crm/sort";
import type { CrmLead } from "@/lib/domain/crm/types";
import { formatCrmDate, getLeadTitle } from "@/lib/domain/crm/utils";
import type { CrmTableActions } from "../types";
import { DissatisfiedBadge, ProgramBadges } from "./CrmBadges";
import { CrmRowActionsMenu } from "./CrmRowActionsMenu";
import { CustomerBadge, LinkedMark, stop } from "./CrmRowParts";
import { LeadScoreBadge } from "./LeadScoreBadge";
import { StatusDropdown } from "./StatusDropdown";

/**
 * Aday tablosu — sade: Müşteri, Konum, Tarih, Satış aşaması (satır içi seçici), (yönetici) tutarlar ve tek "İşlemler"
 * menüsü. Satıra tıklamak (ya da odaklıyken Enter) aday panelini (düzenleme) açar.
 */
export function CrmTable({
  leads,
  actions,
  sort = null,
  onSort,
  selection,
}: {
  leads: CrmLead[];
  actions: CrmTableActions;
  sort?: SortState<CrmSortKey> | null;
  onSort?: (key: CrmSortKey) => void;
  /** Toplu işlem seçimi; verilmezse seçim sütunu çizilmez. */
  selection?: { selected: ReadonlySet<string>; toggle: (id: string) => void; setMany: (ids: string[], on: boolean) => void };
}) {
  const t = useTranslations("crm.list");
  const tBulk = useTranslations("crm.bulk");
  const { canSeeFinancials } = usePermissions();
  const pageIds = leads.map((l) => l.id);
  const selectedOnPage = selection ? pageIds.filter((id) => selection.selected.has(id)).length : 0;
  const allOnPage = pageIds.length > 0 && selectedOnPage === pageIds.length;
  // Satış / Tahsil edilen sütunları yalnız finans yetkisiyle (CRM_AGENT görmez; sunucu da boş gönderir).
  const money = canSeeFinancials;
  const head = (key: CrmSortKey, label: string, align?: "right") =>
    onSort ? (
      <SortableHeader label={label} sortKey={key} sort={sort} onSort={onSort} align={align} />
    ) : (
      <TableHead className={align === "right" ? "text-right" : undefined}>{label}</TableHead>
    );

  return (
    <div className="hidden w-full overflow-x-auto md:block">
      <Table className="[&_td]:whitespace-nowrap [&_th]:whitespace-nowrap [&_thead_tr]:bg-muted/40">
        <TableHeader>
          <TableRow>
            {selection && (
              <TableHead className="w-px">
                <Checkbox
                  checked={allOnPage ? true : selectedOnPage > 0 ? "indeterminate" : false}
                  onCheckedChange={(v) => selection.setMany(pageIds, v === true)}
                  aria-label={tBulk("selectPage")}
                />
              </TableHead>
            )}
            {head("customer", t("table.customer"))}
            {head("location", t("table.location"))}
            {head("date", t("table.date"))}
            {head("stage", t("table.salesStage"))}
            {head("score", t("table.score"))}
            {money && head("sale", t("table.saleAmount"), "right")}
            {money && head("collected", t("table.collected"), "right")}
            <TableHead className="w-px text-right">{t("table.actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {leads.map((lead) => {
            const { title, subtitle } = getLeadTitle(lead);
            const locationTitle = [lead.district, lead.city, lead.country].filter(Boolean).join(", ");
            const balance = leadBalance(lead);
            const open = () => actions.onOpen?.(lead);

            return (
              <TableRow
                key={lead.id}
                role={actions.onOpen ? "button" : undefined}
                tabIndex={actions.onOpen ? 0 : undefined}
                aria-label={actions.onOpen ? t("openDetail", { name: title }) : undefined}
                onClick={actions.onOpen ? open : undefined}
                onKeyDown={
                  actions.onOpen
                    ? (e) => {
                        if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
                          e.preventDefault();
                          open();
                        }
                      }
                    : undefined
                }
                className={
                  actions.onOpen
                    ? "cursor-pointer focus-visible:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60"
                    : undefined
                }
              >
                {selection && (
                  <TableCell className="w-px" onClick={stop} onKeyDown={stop}>
                    <Checkbox
                      checked={selection.selected.has(lead.id)}
                      onCheckedChange={() => selection.toggle(lead.id)}
                      aria-label={tBulk("selectRow", { name: title })}
                    />
                  </TableCell>
                )}
                <TableCell className="max-w-[280px]">
                  <div className="flex min-w-0 flex-col">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="max-w-[220px] truncate font-medium" title={title}>
                        {title}
                      </span>
                      <LinkedMark lead={lead} />
                      <CustomerBadge lead={lead} />
                      <DissatisfiedBadge value={lead.dissatisfaction} />
                      {actions.renderSatisfaction?.(lead)}
                      <ProgramBadges tags={lead.programTags} />
                    </span>
                    {subtitle && (
                      <span className="max-w-[220px] truncate text-xs text-muted-foreground" title={subtitle}>
                        {subtitle}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-xs" title={locationTitle || undefined}>
                  {lead.city || lead.country || "—"}
                </TableCell>
                <TableCell className="text-xs tabular-nums">{formatCrmDate(lead.createdAt)}</TableCell>
                <TableCell onClick={stop} onKeyDown={stop}>
                  <StatusDropdown lead={lead} onSold={actions.onStatusSold} />
                </TableCell>
                <TableCell>
                  <LeadScoreBadge lead={lead} />
                </TableCell>
                {money && (
                  <TableCell className="text-right text-sm tabular-nums">
                    {/* Satış yoksa teklif tutarı (soluk, "teklif" etiketiyle) — teklif aşamasında tutar listede görünsün. */}
                    {lead.saleAmount ? (
                      <Money value={lead.saleAmount} />
                    ) : lead.offerAmount ? (
                      <span className="inline-flex items-baseline gap-1 text-muted-foreground" title={t("table.offerTitle")}>
                        <Money value={lead.offerAmount} />
                        <span className="text-[11px]">{t("table.offerTag")}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                )}
                {money && (
                  <TableCell className="text-right text-sm tabular-nums">
                    <span className="flex flex-col items-end">
                      {lead.collectedAmount ? <Money value={lead.collectedAmount} /> : <span className="text-muted-foreground">—</span>}
                      {balance > 0 && (
                        <span className="text-xs text-destructive">
                          {t("remainingShort")} <Money value={balance} />
                        </span>
                      )}
                    </span>
                  </TableCell>
                )}
                <TableCell className="w-px" onClick={stop} onKeyDown={stop}>
                  <CrmRowActionsMenu lead={lead} actions={actions} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
