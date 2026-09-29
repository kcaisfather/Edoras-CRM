"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Building2, Check, ClipboardList, Copy, Loader2, MessageCircle, RotateCw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { CoverageNote } from "@/components/ui/coverage-note";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryErrorState } from "@/components/query-error-state";
import { Link } from "@/lib/navigation";
import { useApiErrorMessage } from "@/lib/hooks/use-api-error-message";
import { csvDate, downloadCsv } from "@/lib/utils/csv";
import { formatCrmDate } from "@/lib/domain/crm/utils";
import { isAwaitingFollowUp, isInvitationOpen } from "@/lib/domain/surveys/logic";
import { buildSurveyReminder } from "@/lib/domain/surveys/message";
import type { SurveyInvitation } from "@/lib/domain/surveys/types";
import { useMarkInvitationSent, useResendInvitation } from "../mutations";
import { useSurveyFollowUpDays, useSurveyInvitations } from "../queries";
import { appOrigin } from "../recipients";
import { Pill, STATUS_TONE, copyText } from "./parts";

export type InvFilter = "all" | "notSent" | "awaiting" | "responded" | "failed";
const FILTERS: InvFilter[] = ["all", "notSent", "awaiting", "responded", "failed"];

function matchesFilter(inv: SurveyInvitation, filter: InvFilter, now: number, days: number): boolean {
  switch (filter) {
    case "notSent":
      return inv.status === "CREATED";
    case "awaiting":
      return isAwaitingFollowUp(inv, now, days);
    case "responded":
      return inv.status === "RESPONDED";
    case "failed":
      return inv.status === "FAILED" || inv.status === "EXPIRED";
    default:
      return true;
  }
}

/** Gönderimler: süzgeç, CSV, satırda kopyala / WhatsApp hatırlatması / "Gönderdim" / e-postayı yeniden gönder. */
export function SurveyInvitationsTab({
  surveyId,
  mailEnabled,
  filter,
  onFilter,
}: {
  surveyId: string;
  mailEnabled: boolean;
  filter: InvFilter;
  onFilter: (f: InvFilter) => void;
}) {
  const t = useTranslations("surveys.invitations");
  const tc = useTranslations("surveys.common");
  const query = useSurveyInvitations(surveyId);
  const days = useSurveyFollowUpDays();
  const [resendTarget, setResendTarget] = useState<SurveyInvitation | null>(null);

  const rows = useMemo(() => {
    const now = new Date().getTime();
    return (query.data?.items ?? []).filter((i) => matchesFilter(i, filter, now, days));
  }, [query.data, filter, days]);

  const exportCsv = () =>
    downloadCsv(
      "anket-gonderimleri",
      [t("table.recipient"), t("table.organization"), t("table.email"), t("table.phone"), t("table.channel"), t("table.status"), t("table.sent"), t("table.responded"), t("table.sentBy")],
      rows.map((i) => [
        i.recipientName,
        i.organizationName,
        i.email,
        i.phone,
        t(`channels.${i.channel}`),
        t(`statuses.${i.status}`),
        csvDate(i.sentAt ?? i.createdAt),
        csvDate(i.respondedAt),
        i.createdByName,
      ])
    );

  if (query.isLoading) return <Skeleton className="h-64 w-full rounded-2xl" />;
  if (query.isError) return <QueryErrorState onRetry={() => void query.refetch()} />;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="overflow-x-auto">
          <SegmentedControl<InvFilter>
            value={filter}
            onValueChange={onFilter}
            aria-label={t("filterLabel")}
            options={FILTERS.map((v) => ({ value: v, label: t(`filters.${v}`, { days }) }))}
          />
        </div>
        <Button size="sm" variant="outline" onClick={exportCsv}>
          {tc("csv")}
        </Button>
      </div>
      {query.data?.truncated && <CoverageNote>{tc("truncated", { loaded: query.data.items.length, total: query.data.total })}</CoverageNote>}

      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/60">
        <div className="w-full overflow-x-auto">
          <Table className="min-w-max [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap [&_thead_tr]:bg-muted/40">
            <TableHeader>
              <TableRow>
                <TableHead>{t("table.recipient")}</TableHead>
                <TableHead>{t("table.channel")}</TableHead>
                <TableHead>{t("table.status")}</TableHead>
                <TableHead>{t("table.sent")}</TableHead>
                <TableHead>{t("table.responded")}</TableHead>
                <TableHead>{tc("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    {tc("empty")}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((inv) => <InvitationRow key={inv.id} inv={inv} mailEnabled={mailEnabled} onResend={setResendTarget} />)
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <ResendDialog target={resendTarget} onClose={() => setResendTarget(null)} />
    </div>
  );
}

function InvitationRow({ inv, mailEnabled, onResend }: { inv: SurveyInvitation; mailEnabled: boolean; onResend: (inv: SurveyInvitation) => void }) {
  const t = useTranslations("surveys.invitations");
  const tc = useTranslations("surveys.common");
  const errorMessage = useApiErrorMessage();
  const markSent = useMarkInvitationSent();
  const open = isInvitationOpen(inv, new Date().getTime());
  const sent = inv.status !== "CREATED";
  const r = buildSurveyReminder({ origin: appOrigin(), token: inv.token, name: inv.recipientName, phone: inv.phone, kind: sent ? "reminder" : "invite" });
  const iconLink = buttonVariants({ variant: "ghost", size: "icon-sm" });

  const confirmSent = () =>
    markSent.mutate(inv.id, {
      onSuccess: () => toast.success(t("markedSent")),
      onError: (err) => toast.error(errorMessage(err, t("markSentFailed"))),
    });

  return (
    <TableRow>
      <TableCell>
        <div className="flex flex-col">
          <span className="font-medium">{inv.organizationName || inv.recipientName || "—"}</span>
          <span className="text-xs text-muted-foreground">
            {[inv.organizationName ? inv.recipientName : null, inv.email || inv.phone].filter(Boolean).join(" · ")}
          </span>
        </div>
      </TableCell>
      <TableCell>{t(`channels.${inv.channel}`)}</TableCell>
      <TableCell>
        <Pill className={STATUS_TONE[inv.status]}>{t(`statuses.${inv.status}`)}</Pill>
        {inv.status === "FAILED" && inv.error && <span className="block text-xs text-destructive">{inv.error}</span>}
      </TableCell>
      <TableCell className="tabular-nums" title={inv.createdByName ? `${t("table.sentBy")}: ${inv.createdByName}` : undefined}>
        {formatCrmDate(inv.sentAt ?? inv.createdAt)}
      </TableCell>
      <TableCell className="tabular-nums">{formatCrmDate(inv.respondedAt)}</TableCell>
      <TableCell>
        <div className="flex items-center gap-0.5">
          {open && (
            <Button variant="ghost" size="icon-sm" onClick={() => copyText(r.message, tc("copied"), tc("copyFailed"))} title={t("copyMessage")} aria-label={t("copyMessage")}>
              <Copy />
            </Button>
          )}
          {open && r.whatsappUrl && (
            <a href={r.whatsappUrl} target="_blank" rel="noopener noreferrer" className={iconLink} title={t("whatsappReminder")} aria-label={t("whatsappReminder")}>
              <MessageCircle />
            </a>
          )}
          {open && !sent && inv.channel !== "EMAIL" && (
            <Button variant="ghost" size="icon-sm" onClick={confirmSent} disabled={markSent.isPending} title={t("markSentHint")} aria-label={t("markSent")}>
              {markSent.isPending ? <Loader2 className="animate-spin" /> : <Check />}
            </Button>
          )}
          {open && inv.channel === "EMAIL" && inv.email && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onResend(inv)}
              disabled={!mailEnabled}
              title={mailEnabled ? t("resendEmail") : t("mailOff")}
              aria-label={t("resendEmail")}
            >
              <RotateCw />
            </Button>
          )}
          {inv.leadId ? (
            <Link href={`/crm?lead=${inv.leadId}`} className={iconLink} title={tc("openLead")} aria-label={tc("openLead")}>
              <ClipboardList />
            </Link>
          ) : (
            inv.institutionId && (
              <Link href={`/institutions/${inv.institutionId}`} className={iconLink} title={tc("openInstitution")} aria-label={tc("openInstitution")}>
                <Building2 />
              </Link>
            )
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

function ResendDialog({ target, onClose }: { target: SurveyInvitation | null; onClose: () => void }) {
  const t = useTranslations("surveys.invitations");
  const tc = useTranslations("surveys.common");
  const errorMessage = useApiErrorMessage();
  const resend = useResendInvitation();
  const submit = (id: string) =>
    resend.mutate(id, {
      onSuccess: () => {
        toast.success(t("resent"));
        onClose();
      },
      onError: (err) => toast.error(errorMessage(err, t("resendFailed"))),
    });

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && !resend.isPending && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("resendTitle")}</DialogTitle>
          <DialogDescription>{t("resendBody", { email: target?.email ?? "" })}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={resend.isPending}>
            {tc("cancel")}
          </Button>
          <Button onClick={() => target && submit(target.id)} disabled={resend.isPending} aria-busy={resend.isPending}>
            {resend.isPending && <Loader2 className="animate-spin" />}
            {t("resendConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
