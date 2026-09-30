"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { CalendarClock, Loader2, Mail, Pencil, Plus, Send, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { QueryErrorState } from "@/components/query-error-state";
import {
  NEW_REPORT_DRAFT,
  ReportEditor,
  ReportPreviewCard,
  draftFromSubscription,
  draftToBody,
  useDeleteReportSubscription,
  useReportSubscriptions,
  useSaveReportSubscription,
  useSendReportNow,
  validateDraft,
  type ReportDraft,
} from "@/features/reports";
import { apiErrorCode } from "@/lib/api/errors";
import { useApiErrorMessage } from "@/lib/hooks/use-api-error-message";
import { REPORT_SECTIONS, type ReportSubscriptionDto } from "@/lib/domain/reports/types";
import { displayName, type StaffMember } from "@/lib/domain/staff/logic";
import { cn } from "@/lib/utils";
import { useStaff } from "../team/queries";

type Confirm = { kind: "save" } | { kind: "send"; sub: ReportSubscriptionDto } | { kind: "delete"; sub: ReportSubscriptionDto } | null;

/**
 * Ayarlar → Raporlar (yalnız yönetici). DeepSport ReportsPanel'in EdorasCRM karşılığı: abonelikler CRM veritabanında
 * (tarayıcı taslağı yok), alıcılar yalnız aktif CRM personeli, rapor sunucuda üretilir ve her alıcıya kendi rolüne göre
 * gider. Kaydet / Şimdi gönder / Sil gerçek alıcıları etkilediği için onay diyaloğundan geçer.
 */
export function ReportsPanel() {
  const t = useTranslations("settingsx.reports");
  const locale = useLocale();
  const errorMessage = useApiErrorMessage();
  const subs = useReportSubscriptions();
  const staff = useStaff();
  const saveMut = useSaveReportSubscription();
  const deleteMut = useDeleteReportSubscription();
  const sendMut = useSendReportNow();

  const [draft, setDraft] = useState<ReportDraft | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);

  const members = useMemo(() => new Map((staff.data ?? []).map((m) => [m.id, m])), [staff.data]);
  const list = subs.data ?? [];
  const pending = saveMut.isPending || deleteMut.isPending || sendMut.isPending;

  const memberLabel = (id: string) => (members.get(id) ? displayName(members.get(id) as StaffMember) : "—");
  const fmtDateTime = (ms: number | null | undefined) =>
    ms == null
      ? "—"
      : new Intl.DateTimeFormat(locale, { timeZone: "Europe/Istanbul", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(ms);

  const summary = (s: Pick<ReportSubscriptionDto, "frequency" | "time" | "weekday" | "dayOfMonth">) =>
    s.frequency === "WEEKLY"
      ? t("summaryWeekly", { weekday: t(`weekdays.${s.weekday ?? 1}`), time: s.time })
      : s.frequency === "MONTHLY"
        ? t("summaryMonthly", { day: s.dayOfMonth ?? 1, time: s.time })
        : t("summaryDaily", { time: s.time });

  const closeEditor = () => {
    setDraft(null);
    setShowErrors(false);
  };

  const onSaveClick = () => {
    if (!draft) return;
    if (validateDraft(draft).length > 0) {
      setShowErrors(true);
      return;
    }
    setConfirm({ kind: "save" });
  };

  const sendErrorText = (err: unknown) => {
    const code = apiErrorCode(err);
    if (code === "MAIL_SEND_FAILED") return t("sendFailed");
    if (code === "REPORT_RECIPIENT_INVALID") return t("sendNoRecipients");
    return errorMessage(err, t("sendError"));
  };

  const runConfirmed = async () => {
    if (!confirm) return;
    try {
      if (confirm.kind === "save" && draft) {
        await saveMut.mutateAsync({ id: draft.id, input: draftToBody(draft) });
        toast.success(t("saved"));
        closeEditor();
      } else if (confirm.kind === "send") {
        const res = await sendMut.mutateAsync(confirm.sub.id);
        toast.success(res.failed > 0 ? t("sentPartial", { count: res.sentTo, failed: res.failed }) : t("sent", { count: res.sentTo }));
      } else if (confirm.kind === "delete") {
        await deleteMut.mutateAsync(confirm.sub.id);
        toast.success(t("deleted"));
        if (draft?.id === confirm.sub.id) closeEditor();
      }
    } catch (err) {
      toast.error(confirm.kind === "send" ? sendErrorText(err) : errorMessage(err, confirm.kind === "delete" ? t("deleteError") : t("saveError")));
    }
    setConfirm(null);
  };

  const confirmRecipients = confirm?.kind === "save" ? (draft?.recipientIds ?? []) : confirm ? confirm.sub.recipientIds : [];

  return (
    <div className="space-y-6">
      <Card className="glass-panel rounded-2xl overflow-hidden">
        <CardHeader className="pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-4">
              <div className="p-3 rounded-xl bg-primary/10 border border-primary/20">
                <Mail className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-bold">{t("title")}</h2>
                <p className="text-sm text-muted-foreground">{t("description")}</p>
              </div>
            </div>
            {!draft && (
              <Button onClick={() => setDraft({ ...NEW_REPORT_DRAFT })}>
                <Plus />
                {t("new")}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-4">
          <p className="text-xs text-muted-foreground">{t("roleNote")}</p>
          <p className="text-xs text-muted-foreground">{t("sendingNote")}</p>

          {subs.isLoading ? (
            <Skeleton className="h-32 w-full rounded-xl" />
          ) : subs.isError ? (
            <QueryErrorState onRetry={() => void subs.refetch()} />
          ) : list.length === 0 && !draft ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <ul className="space-y-3">
              {list.map((s) => (
                <li key={s.id} className={cn("rounded-xl border border-border/60 p-3 space-y-2", draft?.id === s.id && "border-primary/50")}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-medium">
                        <span className="truncate">{s.name}</span>
                        {!s.active && <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{t("inactive")}</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {summary(s)} · {t("recipientCount", { count: s.recipientIds.length })} · {t("sectionCount", { count: s.sections.length })}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => setConfirm({ kind: "send", sub: s })} disabled={pending}>
                        <Send />
                        {t("sendNow")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setDraft(draftFromSubscription(s));
                          setShowErrors(false);
                        }}
                        disabled={pending}
                      >
                        <Pencil />
                        {t("edit")}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setConfirm({ kind: "delete", sub: s })} disabled={pending} aria-label={t("delete")}>
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">{s.recipientIds.map(memberLabel).join(", ")}</p>
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <CalendarClock className="h-3.5 w-3.5" aria-hidden />
                      {s.active ? t("nextRun", { when: fmtDateTime(s.nextRunAt) }) : t("inactive")}
                    </span>
                    <span>{s.lastSentAt != null ? t("lastSent", { when: fmtDateTime(s.lastSentAt) }) : t("neverSent")}</span>
                    {s.lastRun && (
                      <span className={cn(s.lastRun.status === "FAILED" && "text-destructive")}>
                        {t(`lastRun.${s.lastRun.status}`, { count: s.lastRun.sentTo })}
                        {s.lastRun.manual && ` · ${t("lastRunManual")}`}
                      </span>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {draft && (
        <ReportEditor
          draft={draft}
          onChange={(patch) => setDraft((d) => (d ? { ...d, ...patch } : d))}
          members={{ all: staff.data ?? [], loading: staff.isLoading, error: staff.isError, retry: () => void staff.refetch() }}
          showErrors={showErrors}
          pending={pending}
          onSave={onSaveClick}
          onCancel={closeEditor}
        />
      )}

      <ReportPreviewCard frequency={draft?.frequency ?? list[0]?.frequency ?? "DAILY"} sections={draft?.sections ?? list[0]?.sections ?? [...REPORT_SECTIONS]} />

      <Dialog open={confirm != null} onOpenChange={(o) => !o && !pending && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirm?.kind === "send" ? t("confirm.sendTitle") : confirm?.kind === "delete" ? t("confirm.deleteTitle") : t("confirm.saveTitle")}</DialogTitle>
            <DialogDescription>
              {confirm?.kind === "send"
                ? t("confirm.sendBody", { name: confirm.sub.name, count: confirmRecipients.length })
                : confirm?.kind === "delete"
                  ? t("confirm.deleteBody", { name: confirm.sub.name })
                  : draft
                    ? t("confirm.saveBody", {
                        count: confirmRecipients.length,
                        summary: summary({ frequency: draft.frequency, time: draft.time, weekday: draft.weekday, dayOfMonth: draft.dayOfMonth }),
                      })
                    : ""}
            </DialogDescription>
          </DialogHeader>
          {confirm && confirm.kind !== "delete" && (
            <ul className="max-h-40 overflow-y-auto rounded-lg border border-border/60 p-2 text-xs text-muted-foreground">
              {confirmRecipients.map((id) => (
                <li key={id}>{members.get(id) ? `${memberLabel(id)} · ${members.get(id)?.email}` : "—"}</li>
              ))}
            </ul>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)} disabled={pending}>
              {t("cancel")}
            </Button>
            <Button variant={confirm?.kind === "delete" ? "destructive" : "default"} onClick={runConfirmed} disabled={pending} aria-busy={pending}>
              {pending && <Loader2 className="animate-spin" />}
              {confirm?.kind === "send" ? t("confirm.send") : confirm?.kind === "delete" ? t("confirm.delete") : t("confirm.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
