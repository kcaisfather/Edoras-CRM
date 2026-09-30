"use client";

import { useTranslations } from "next-intl";
import { Building2, FileText, FlaskConical, HandCoins, HeartHandshake, MessageSquareHeart, MessageSquarePlus, Pencil } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { SortableHeader } from "@/components/ui/sortable-header";
import { Money } from "@/components/ui/money";
import { Link } from "@/lib/navigation";
import { usePermissions } from "@/features/auth";
import type { SortState } from "@/lib/utils/sort";
import { leadBalance } from "@/lib/domain/crm/signals";
import type { CrmSortKey } from "@/lib/domain/crm/sort";
import type { CrmLead } from "@/lib/domain/crm/types";
import { formatCrmDate, getLeadTitle } from "@/lib/domain/crm/utils";
import type { CrmTableActions } from "../types";
import { DissatisfiedBadge, ProgramBadges, StatusBadge } from "./CrmBadges";
import { CrmContactMenu, contactTargetFor } from "./CrmContactMenu";

/** Satır içindeki düğme/menü tıklamaları satırı (detay penceresini) açmasın. */
export const stop = (e: React.SyntheticEvent) => e.stopPropagation();

/**
 * Aday tablosu — sade: Müşteri, Konum, Tarih, Satış aşaması, (yönetici) tutarlar ve kısa işlemler.
 * Satıra tıklamak (ya da odaklıyken Enter) aday detay penceresini açar.
 */
export function CrmTable({
  leads,
  actions,
  sort = null,
  onSort,
}: {
  leads: CrmLead[];
  actions: CrmTableActions;
  sort?: SortState<CrmSortKey> | null;
  onSort?: (key: CrmSortKey) => void;
}) {
  const t = useTranslations("crm.list");
  const { canSeeFinancials } = usePermissions();
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
            {head("customer", t("table.customer"))}
            {head("location", t("table.location"))}
            {head("date", t("table.date"))}
            {head("stage", t("table.salesStage"))}
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
                <TableCell>
                  <StatusBadge status={lead.status} />
                </TableCell>
                {money && (
                  <TableCell className="text-right text-sm tabular-nums">
                    {lead.saleAmount ? <Money value={lead.saleAmount} /> : <span className="text-muted-foreground">—</span>}
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
                  <RowActions lead={lead} actions={actions} title={title} money={money} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function RowActions({ lead, actions, title, money }: { lead: CrmLead; actions: CrmTableActions; title: string; money: boolean }) {
  const t = useTranslations("crm.list");
  return (
    <div className="flex flex-nowrap items-center justify-end gap-0.5">
      <Button variant="ghost" size="icon-sm" onClick={() => actions.onEdit(lead)} aria-label={t("actions.edit")} title={t("actions.edit")}>
        <Pencil />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => actions.onAddNote(lead)}
        aria-label={t("actions.addNote")}
        title={t("actions.addNote")}
      >
        <MessageSquarePlus />
      </Button>
      {actions.onOpenDemo && !lead.institutionId && (
        <Button variant="ghost" size="icon-sm" onClick={() => actions.onOpenDemo?.(lead)} aria-label={t("openDemo")} title={t("openDemo")}>
          <FlaskConical />
        </Button>
      )}
      {actions.onAddCollection && money && !!lead.saleAmount && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => actions.onAddCollection?.(lead)}
          aria-label={t("addCollection")}
          title={t("addCollection")}
        >
          <HandCoins />
        </Button>
      )}
      <IssueInvoiceButton lead={lead} actions={actions} />
      <SendSurveyButton lead={lead} actions={actions} />
      {actions.renderAssignTask?.(lead)}
      <CrmContactMenu target={contactTargetFor(lead, title, money)} />
    </div>
  );
}

/**
 * "Anket gönder" (anketler modülü `onSendSurvey` verirse): adayın ya da bağlı kurum yetkilisinin e-postası / telefonu
 * varsa (DeepSport: iletişimi olan lead). Satır, mobil kart ve detay penceresi aynı düğmeyi kullanır.
 */
export function SendSurveyButton({ lead, actions, onClick }: { lead: CrmLead; actions: CrmTableActions; onClick?: () => void }) {
  const t = useTranslations("crm.list");
  const crm = lead.institution?.crm;
  if (!actions.onSendSurvey || !(lead.contactEmail || lead.contactPhone || crm?.contactEmail || crm?.contactPhone)) return null;
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={onClick ?? (() => actions.onSendSurvey?.(lead))}
      aria-label={t("sendSurvey")}
      title={t("sendSurvey")}
    >
      <MessageSquareHeart />
    </Button>
  );
}

/**
 * "Fatura kes" (faturalar modülü `onIssueInvoice` verirse): yalnız finans yetkisiyle ve ücretli kuruma bağlı adayda
 * (fatura kurumun lisansı / ödemesi içindir). Satır, mobil kart ve detay penceresi aynı düğmeyi kullanır.
 */
export function IssueInvoiceButton({
  lead,
  actions,
  onClick,
  showLabel,
}: {
  lead: CrmLead;
  actions: CrmTableActions;
  onClick?: () => void;
  showLabel?: boolean;
}) {
  const t = useTranslations("crm.list");
  const { canSeeFinancials } = usePermissions();
  if (!actions.onIssueInvoice || !canSeeFinancials || !lead.institutionId || lead.institution?.crm?.status !== "UCRETLI") return null;
  return (
    <Button
      variant={showLabel ? "outline" : "ghost"}
      size={showLabel ? "sm" : "icon-sm"}
      onClick={onClick ?? (() => actions.onIssueInvoice?.(lead))}
      aria-label={t("issueInvoice")}
      title={t("issueInvoice")}
    >
      <FileText />
      {showLabel ? t("issueInvoice") : null}
    </Button>
  );
}

/** Edoras kurumuna bağlı aday işareti (başlıkta kurum adı). */
export function LinkedMark({ lead }: { lead: CrmLead }) {
  const t = useTranslations("crm.list");
  if (!lead.institutionId) return null;
  const label = lead.institution?.name ? t("linkedHint", { name: lead.institution.name }) : t("linkedUnknown");
  return (
    <span title={label} className="inline-flex shrink-0">
      <Building2 className="h-3.5 w-3.5 text-primary" aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** Satış olmuş aday: "Müşteri" rozeti → bağlı kurumun sayfası (satır tıklamasını tetiklemez). */
export function CustomerBadge({ lead }: { lead: CrmLead }) {
  const t = useTranslations("crm.list");
  if (lead.status !== "SATIS_OLDU") return null;
  const className =
    "inline-flex shrink-0 items-center gap-1 rounded-full border border-success/30 bg-success/10 px-1.5 py-0.5 text-[11px] font-medium text-success";
  const content = (
    <>
      <HeartHandshake className="h-3 w-3" aria-hidden />
      {t("customerBadge")}
    </>
  );
  if (!lead.institutionId) return <span className={className}>{content}</span>;
  return (
    <Link
      href={`/institutions/${lead.institutionId}`}
      onClick={stop}
      onKeyDown={stop}
      title={t("customerBadgeHint")}
      className={`${className} hover:underline`}
    >
      {content}
    </Link>
  );
}
