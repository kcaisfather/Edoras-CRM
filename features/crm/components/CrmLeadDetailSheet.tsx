"use client";

import { useTranslations } from "next-intl";
import { HandCoins, Mail, MapPin, MessageSquarePlus, MessageSquareWarning, Pencil, Phone } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryErrorState } from "@/components/query-error-state";
import { FinancialOnly, usePermissions } from "@/features/auth";
import { formatPhone } from "@/features/institutions";
import { useLeadNotes } from "@/features/crm-notes";
import { parseNoteContent } from "@/lib/domain/crm-notes/utils";
import type { CrmLead } from "@/lib/domain/crm/types";
import { formatCrmDate, formatCurrency, getLeadTitle, getRemainingAmount } from "@/lib/domain/crm/utils";
import type { CrmTableActions } from "../types";
import { StatusBadge } from "./CrmBadges";
import { CrmCollectionHistory } from "./CrmCollectionHistory";
import { CrmContactMenu, contactTargetFor } from "./CrmContactMenu";
import { CrmLeadInstitution } from "./CrmLeadInstitution";

const NOTE_LIMIT = 8;

/**
 * Aday detay penceresi (satıra tıklama): kimlik + iletişim, takip (kaynak, sonraki arama, teklif / satış tarihi,
 * kayıp nedeni), Edoras kurumu (durum, kullanım sayıları), tutarlar ve tahsilat geçmişi (yalnız finans
 * yetkisiyle) ve son notlar. Salt okunur; değişiklik "Düzenle" ile düzenleme penceresinde yapılır.
 */
export function CrmLeadDetailSheet({
  lead,
  onOpenChange,
  actions,
}: {
  lead: CrmLead | null;
  onOpenChange: (open: boolean) => void;
  actions: CrmTableActions;
}) {
  const open = lead != null;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {lead ? <DetailBody lead={lead} onOpenChange={onOpenChange} actions={actions} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function DetailBody({ lead, onOpenChange, actions }: { lead: CrmLead; onOpenChange: (open: boolean) => void; actions: CrmTableActions }) {
  const t = useTranslations("crm.detail");
  const tList = useTranslations("crm.list");
  const tSource = useTranslations("crm.source");
  const tOffer = useTranslations("crm.offer");
  const tX = useTranslations("crm");
  const { canSeeFinancials } = usePermissions();

  const { title, subtitle } = getLeadTitle(lead);
  const location = [lead.district, lead.city, lead.country].filter(Boolean).join(", ");
  // Aksiyon sonrası pencere kapanır; açılan pencere tek başına görünür.
  const run = (fn?: (lead: CrmLead) => void) => () => {
    onOpenChange(false);
    fn?.(lead);
  };

  return (
    <>
      <SheetHeader className="space-y-1.5 pr-8 text-left">
        <SheetTitle className="break-words">{title}</SheetTitle>
        <SheetDescription className="flex flex-wrap items-center gap-2">
          {subtitle && <span>{subtitle}</span>}
          <StatusBadge status={lead.status} />
        </SheetDescription>
      </SheetHeader>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={run(actions.onEdit)}>
          <Pencil />
          {t("edit")}
        </Button>
        <Button size="sm" variant="outline" onClick={run(actions.onAddNote)}>
          <MessageSquarePlus />
          {tList("actions.addNote")}
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={run((l) => actions.onAddNote(l, "dissatisfied"))}
          aria-label={t("markDissatisfied")}
          title={t("markDissatisfied")}
        >
          <MessageSquareWarning />
        </Button>
        {actions.renderAssignTask?.(lead, { showLabel: true })}
        <CrmContactMenu target={contactTargetFor(lead, title, canSeeFinancials)} />
      </div>

      <Section title={t("contact")}>
        <dl className="space-y-1.5 text-sm">
          {lead.contactPhone && (
            <Row icon={<Phone className="h-3.5 w-3.5" />} label={t("phone")}>
              {formatPhone(lead.contactPhone)}
            </Row>
          )}
          {lead.contactEmail && (
            <Row icon={<Mail className="h-3.5 w-3.5" />} label={t("email")}>
              <span className="break-all">{lead.contactEmail}</span>
            </Row>
          )}
          {location && (
            <Row icon={<MapPin className="h-3.5 w-3.5" />} label={t("location")}>
              {location}
            </Row>
          )}
          <Row label={t("createdAt")}>{formatCrmDate(lead.createdAt)}</Row>
        </dl>
      </Section>

      <Section title={t("details")}>
        <dl className="grid grid-cols-[max-content_1fr] items-start gap-x-4 gap-y-2 text-sm">
          {lead.source && (
            <>
              <dt className="text-muted-foreground">{t("source")}</dt>
              <dd>{tSource(lead.source)}</dd>
            </>
          )}
          <dt className="text-muted-foreground">{t("nextCall")}</dt>
          <dd className="tabular-nums">{formatCrmDate(lead.nextFollowUpAt)}</dd>
          {lead.offerSentAt && (
            <>
              <dt className="text-muted-foreground">{t("offerDate")}</dt>
              <dd className="tabular-nums">{formatCrmDate(lead.offerSentAt)}</dd>
            </>
          )}
          {lead.soldAt && (
            <>
              <dt className="text-muted-foreground">{t("soldAt")}</dt>
              <dd className="tabular-nums">{formatCrmDate(lead.soldAt)}</dd>
            </>
          )}
          {lead.lostReason && (
            <>
              <dt className="text-muted-foreground">{t("lostReason")}</dt>
              <dd>{tOffer(`reasons.${lead.lostReason}`)}</dd>
            </>
          )}
        </dl>
      </Section>

      <Section title={tX("institution.title")}>
        <CrmLeadInstitution lead={lead} onOpenDemo={actions.onOpenDemo && run(actions.onOpenDemo)} onLink={actions.onLink && run(actions.onLink)} showUsage />
      </Section>

      {/* Alım-satım geçmişi (yalnız finans yetkisiyle): teklif, satış, tahsilat, kalan, tahsilat kayıtları. */}
      <FinancialOnly>
        <Section title={t("purchaseHistory")}>
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <Amount label={t("offer")} value={lead.offerAmount} />
            <Amount label={tList("table.saleAmount")} value={lead.saleAmount} />
            <Amount label={tList("table.collected")} value={lead.collectedAmount} />
            <Amount
              label={tList("table.remainingDebt")}
              value={lead.saleAmount ? getRemainingAmount(lead.saleAmount, lead.collectedAmount) : null}
              danger={getRemainingAmount(lead.saleAmount, lead.collectedAmount) > 0}
            />
          </dl>
          <CrmCollectionHistory lead={lead} />
          {actions.onAddCollection && (
            <Button size="sm" variant="outline" onClick={run(actions.onAddCollection)}>
              <HandCoins />
              {tList("addCollection")}
            </Button>
          )}
        </Section>
      </FinancialOnly>

      <Section title={t("notes")}>
        <LeadNotesPreview lead={lead} onAll={run(actions.onAddNote)} />
      </Section>
    </>
  );
}

function LeadNotesPreview({ lead, onAll }: { lead: CrmLead; onAll: () => void }) {
  const t = useTranslations("crm.detail");
  const tTag = useTranslations("crm.notes.tag");
  const notes = useLeadNotes(lead.id);
  const list = notes.data ?? [];
  if (notes.isLoading) {
    return (
      <div className="space-y-2" aria-busy="true" aria-label={t("notesLoading")}>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    );
  }
  if (notes.isError) return <QueryErrorState onRetry={() => void notes.refetch()} />;
  if (list.length === 0) return <p className="text-sm text-muted-foreground">{t("notesEmpty")}</p>;
  return (
    <ol className="space-y-2">
      {list.slice(0, NOTE_LIMIT).map((n) => {
        const parsed = parseNoteContent(n.content);
        return (
          <li key={n.id} className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm">
            <p className="mb-0.5 text-xs text-muted-foreground">
              {formatCrmDate(n.createdAt)}
              {n.authorName ? ` · ${n.authorName}` : ""}
              {parsed.tag ? ` · ${tTag(parsed.tag)}` : ""}
            </p>
            <p className="whitespace-pre-wrap break-words">{parsed.body || "—"}</p>
          </li>
        );
      })}
      {list.length > NOTE_LIMIT && (
        <li>
          <Button variant="link" size="sm" className="px-0" onClick={onAll}>
            {t("allNotes", { count: list.length })}
          </Button>
        </li>
      )}
    </ol>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5 space-y-2 border-t border-border pt-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function Row({ icon, label, children }: { icon?: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <dt className="flex w-24 shrink-0 items-center gap-1.5 text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  );
}

function Amount({ label, value, danger }: { label: string; value: number | null | undefined; danger?: boolean }) {
  return (
    <div className="rounded-lg bg-muted/40 px-2.5 py-1.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={danger ? "font-medium tabular-nums text-destructive" : "font-medium tabular-nums"}>
        {value != null ? formatCurrency(value) : "-"}
      </dd>
    </div>
  );
}
