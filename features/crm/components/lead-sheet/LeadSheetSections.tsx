"use client";

/**
 * Aday panelinin (CrmLeadSheet) salt okunur parçaları: eylem satırı, "Ayrıntılar" ızgarası, alım-satım geçmişi (tahsilat
 * kayıtları, fatura) ve not zaman çizelgesi. Hepsi sıkı (küçük boşluk, text-xs etiket / text-sm değer).
 */
import { useTranslations } from "next-intl";
import { ClipboardList, MessageSquarePlus, MessageSquareWarning, PhoneCall } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryErrorState } from "@/components/query-error-state";
import { FinancialOnly, usePermissions } from "@/features/auth";
import { useLeadNotes } from "@/features/crm-notes";
import { parseNoteContent } from "@/lib/domain/crm-notes/utils";
import type { CrmLead } from "@/lib/domain/crm/types";
import { formatCrmDate } from "@/lib/domain/crm/utils";
import type { CrmTableActions } from "../../types";
import { CrmCollectionHistory } from "../CrmCollectionHistory";
import { CrmContactMenu, contactTargetFor } from "../CrmContactMenu";
import { IssueInvoiceButton, SendSurveyButton } from "../CrmRowParts";

const NOTE_LIMIT = 8;

/**
 * Eylem satırı — hepsi aynı biçim (outline sm, ikon + kısa etiket): Not ekle, Görev ata, Arama listesine ekle, Şikâyet,
 * Anket gönder, İletişim. Verilmeyen eylem çizilmez.
 */
export function LeadActionRow({ lead, title, actions }: { lead: CrmLead; title: string; actions: Partial<CrmTableActions> }) {
  const t = useTranslations("crm.detail");
  const tList = useTranslations("crm.list");
  const tMenu = useTranslations("crm.list.rowMenu");
  const { canSeeFinancials } = usePermissions();
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {actions.onAddNote && (
        <Button size="sm" variant="outline" onClick={() => actions.onAddNote?.(lead)}>
          <MessageSquarePlus />
          {tList("actions.addNote")}
        </Button>
      )}
      {actions.onAssignTask && (
        <Button size="sm" variant="outline" onClick={() => actions.onAssignTask?.(lead)}>
          <ClipboardList />
          {tMenu("assignTask")}
        </Button>
      )}
      {actions.onAddToCallList && (
        <Button size="sm" variant="outline" onClick={() => actions.onAddToCallList?.(lead)}>
          <PhoneCall />
          {tMenu("addToCallList")}
        </Button>
      )}
      {actions.onAddNote && (
        <Button size="sm" variant="outline" onClick={() => actions.onAddNote?.(lead, "dissatisfied")} title={t("markDissatisfied")}>
          <MessageSquareWarning />
          {t("complaint")}
        </Button>
      )}
      <SendSurveyButton lead={lead} actions={actions} />
      <CrmContactMenu target={contactTargetFor(lead, title, canSeeFinancials)} showLabel />
    </div>
  );
}

/** Formda olmayan salt okunur ayrıntılar: kaynak, kayıt / teklif / satış tarihi, teklifi veren, satışı yapan. */
export function LeadDetailsSection({ lead }: { lead: CrmLead }) {
  const t = useTranslations("crm.detail");
  const tSource = useTranslations("crm.source");
  const rows: { key: string; label: string; value: React.ReactNode }[] = [];
  if (lead.source) rows.push({ key: "source", label: t("source"), value: tSource(lead.source) });
  rows.push({ key: "createdAt", label: t("createdAt"), value: <span className="tabular-nums">{formatCrmDate(lead.createdAt)}</span> });
  if (lead.offerSentAt) rows.push({ key: "offerDate", label: t("offerDate"), value: <span className="tabular-nums">{formatCrmDate(lead.offerSentAt)}</span> });
  if (lead.offerBy) rows.push({ key: "offerBy", label: t("offerBy"), value: lead.offerByName ?? "-" });
  if (lead.soldAt) rows.push({ key: "soldAt", label: t("soldAt"), value: <span className="tabular-nums">{formatCrmDate(lead.soldAt)}</span> });
  if (lead.soldBy) rows.push({ key: "soldBy", label: t("soldBy"), value: lead.soldByName ?? "-" });
  return (
    <LeadSection title={t("details")}>
      <dl className="grid grid-cols-[minmax(6.5rem,max-content)_1fr] items-start gap-x-3 gap-y-1.5">
        {rows.map((row) => (
          <div key={row.key} className="contents">
            <dt className="pt-0.5 text-xs text-muted-foreground">{row.label}</dt>
            <dd className="min-w-0 text-sm">{row.value}</dd>
          </div>
        ))}
      </dl>
    </LeadSection>
  );
}

/** Alım-satım geçmişi (yalnız finans yetkisiyle): tahsilat kayıtları ve "Fatura kes". Tutarlar formdaki Satış bölümünde. */
export function LeadPurchaseHistory({ lead, actions }: { lead: CrmLead; actions: Partial<CrmTableActions> }) {
  const t = useTranslations("crm.detail");
  if (!lead.saleAmount && !lead.collectedAmount) return null;
  return (
    <FinancialOnly>
      <LeadSection title={t("purchaseHistory")}>
        <CrmCollectionHistory lead={lead} />
        <div className="flex flex-wrap gap-1.5">
          <IssueInvoiceButton lead={lead} actions={actions} />
        </div>
      </LeadSection>
    </FinancialOnly>
  );
}

/** Son notlar (en fazla 8) — tarih · yazar · etiket ve gövde. */
export function NotesTimeline({ lead, onAllNotes }: { lead: CrmLead; onAllNotes?: () => void }) {
  const t = useTranslations("crm.detail");
  const tTag = useTranslations("crm.notes.tag");
  const notes = useLeadNotes(lead.id);
  const list = notes.data ?? [];
  return (
    <LeadSection title={t("notes")}>
      {notes.isLoading ? (
        <div className="space-y-1.5" aria-busy="true" aria-label={t("notesLoading")}>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-lg" />
          ))}
        </div>
      ) : notes.isError ? (
        <QueryErrorState onRetry={() => void notes.refetch()} />
      ) : list.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("notesEmpty")}</p>
      ) : (
        <ol className="space-y-1.5">
          {list.slice(0, NOTE_LIMIT).map((n) => {
            const parsed = parseNoteContent(n.content);
            return (
              <li key={n.id} className="rounded-md border border-border/60 bg-muted/30 px-2.5 py-1.5 text-sm">
                <p className="text-xs text-muted-foreground">
                  {formatCrmDate(n.createdAt)}
                  {n.authorName ? ` · ${n.authorName}` : ""}
                  {parsed.tag ? ` · ${tTag(parsed.tag)}` : ""}
                </p>
                <p className="whitespace-pre-wrap break-words">{parsed.body || "—"}</p>
              </li>
            );
          })}
          {list.length > NOTE_LIMIT && onAllNotes && (
            <li>
              <Button variant="link" size="sm" className="h-auto px-0" onClick={onAllNotes}>
                {t("allNotes", { count: list.length })}
              </Button>
            </li>
          )}
        </ol>
      )}
    </LeadSection>
  );
}

export function LeadSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 border-t border-border pt-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}
