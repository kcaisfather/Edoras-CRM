"use client";

import { useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SidePanel, SidePanelContent, SidePanelDescription, SidePanelFooter, SidePanelHeader, SidePanelTitle } from "@/components/ui/side-panel";
import { QueryErrorState } from "@/components/query-error-state";
import { useAllCrmLeads } from "@/features/crm";
import { useApiErrorMessage } from "@/lib/hooks/use-api-error-message";
import { dedupeRecipients, recipientSkipReason } from "@/lib/domain/surveys/logic";
import { SURVEY_CHANNELS, type SurveyChannel, type SurveyRecipientInput } from "@/lib/domain/surveys/types";
import { useCreateInvitations } from "../mutations";
import { useDefaultSurvey } from "../queries";
import { pickerRecipients } from "../recipients";
import { SendSurveyPicker } from "./SendSurveyPicker";
import { SendSurveyResults, type SendResultRow } from "./SendSurveyResults";

/** Tekil uçla sıralı gönderim — tek seferde en fazla bu kadar alıcı. */
const MAX_RECIPIENTS = 200;

interface Outcome {
  rows: SendResultRow[];
  failedNames: string[];
  firstError: unknown;
  stopped: boolean;
}

/**
 * "Anket gönder" — kişiye ya da toplu (DeepSport SendSurveyDialog). `recipients` verilirse doğrudan onlara (CRM satırı,
 * mobil kart, aday detayı), verilmezse CRM adayları + adayı olmayan kurumlar arasından seçilir. EMAIL: sunucu Resend
 * ile gönderir (ayarlı değilse kanal kapalıdır). WhatsApp / SMS / Link: sunucu kişiye özel link üretir, mesaj panelden
 * açılır / kopyalanır ve personel "Gönderdim" der (otomatik gönderim yok). Her davet bir üretim yazmasıdır: önizleme +
 * onay, sıralı istek, ilerleme, durdur, özet.
 */
export function SendSurveyDialog({
  open,
  onOpenChange,
  recipients: presetRecipients,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipients?: SurveyRecipientInput[];
}) {
  const t = useTranslations("surveys.send");
  const tc = useTranslations("surveys.common");
  const errorMessage = useApiErrorMessage();
  const surveyQuery = useDefaultSurvey(open);
  const { survey, mailEnabled } = surveyQuery;
  const createInvitations = useCreateInvitations();
  const needsPicker = !presetRecipients;
  const all = useAllCrmLeads(open && needsPicker);
  const pickerList = useMemo(() => (needsPicker ? pickerRecipients(all.leads, all.institutions) : []), [needsPicker, all.leads, all.institutions]);

  const [chosen, setChosen] = useState<SurveyChannel | null>(null);
  const channel: SurveyChannel = chosen ?? (mailEnabled ? "EMAIL" : "WHATSAPP");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const cancelRef = useRef(false);

  const selected = useMemo(
    () => dedupeRecipients(presetRecipients ?? pickerList.filter((r) => picked.has(r.key))),
    [presetRecipients, pickerList, picked]
  );
  const eligible = selected.filter((r) => recipientSkipReason(r, channel) == null);
  const skipped = selected.length - eligible.length;
  const tooMany = eligible.length > MAX_RECIPIENTS;
  const emailBlocked = channel === "EMAIL" && !mailEnabled;
  const canRun = !!survey && !running && eligible.length > 0 && !tooMany && !outcome && !emailBlocked;

  const reset = () => {
    setPicked(new Set());
    setDone(0);
    setOutcome(null);
    setChosen(null);
  };

  const close = (next: boolean) => {
    if (running) return;
    if (!next) reset();
    onOpenChange(next);
  };

  const run = async () => {
    if (!canRun || !survey) return;
    setRunning(true);
    setDone(0);
    cancelRef.current = false;
    try {
      const res = await createInvitations.mutateAsync({
        surveyId: survey.id,
        recipients: eligible,
        channel,
        onProgress: setDone,
        shouldStop: () => cancelRef.current,
      });
      const failedNames = res.failed.map(({ recipient: r }) => r.organizationName || r.name || "?");
      setOutcome({ rows: res.ok, failedNames, firstError: res.failed[0]?.error, stopped: res.stopped });
      if (failedNames.length) toast.error(t("partial", { ok: res.ok.length, failed: failedNames.length }));
      else toast.success(t("success", { count: res.ok.length }));
    } catch {
      // Tekil hatalar mutasyon içinde toplanır; buraya yalnız beklenmeyen hata düşer.
      toast.error(t("unexpectedError"));
    } finally {
      setRunning(false);
    }
  };

  return (
    <SidePanel open={open} onOpenChange={close}>
      <SidePanelContent size="2xl">
        <SidePanelHeader>
          <SidePanelTitle>{t("title")}</SidePanelTitle>
          <SidePanelDescription>{t("description")}</SidePanelDescription>
        </SidePanelHeader>

        {outcome ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
              {t("summary", { ok: outcome.rows.length, failed: outcome.failedNames.length, skipped })}
              {outcome.stopped && <span className="block text-warning">{t("stoppedNote")}</span>}
              {outcome.rows.some((r) => r.invitation.reused) && <span className="block text-xs text-muted-foreground">{t("reused")}</span>}
              {outcome.failedNames.length > 0 && (
                <span className="block text-xs text-destructive">
                  {t("failedList", { names: outcome.failedNames.slice(0, 10).join(", ") })} — {errorMessage(outcome.firstError)}
                </span>
              )}
            </div>
            <SendSurveyResults rows={outcome.rows} channel={channel} />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <p className="text-sm font-medium">{t("channel")}</p>
              <SegmentedControl<SurveyChannel>
                value={channel}
                onValueChange={setChosen}
                aria-label={t("channel")}
                options={SURVEY_CHANNELS.map((c) => ({ value: c, label: t(`channels.${c}`), disabled: running || (c === "EMAIL" && !mailEnabled) }))}
              />
              <p className="text-xs text-muted-foreground">{t(`channelHints.${channel}`)}</p>
              {!mailEnabled && !surveyQuery.isLoading && <p className="text-xs text-warning">{t("mailOff")}</p>}
            </div>

            {needsPicker && (
              <SendSurveyPicker
                recipients={pickerList}
                channel={channel}
                picked={picked}
                onPickedChange={setPicked}
                running={running}
                isLoading={all.isLoading}
                isError={all.isError}
                onRetry={all.refetch}
              />
            )}

            <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
              {selected.length === 0 ? t("pickSomeone") : t("preview", { count: eligible.length, skipped, channel: t(`channels.${channel}`) })}
              {tooMany && <p className="mt-1 text-destructive">{t("tooMany", { max: MAX_RECIPIENTS })}</p>}
            </div>

            {surveyQuery.isLoading ? (
              <Skeleton className="h-9 w-full rounded-lg" />
            ) : surveyQuery.isError ? (
              <QueryErrorState onRetry={() => void surveyQuery.refetch()} />
            ) : (
              !survey && (
                <p className="text-sm text-destructive" role="alert">
                  {t("noSurvey")}
                </p>
              )
            )}

            {(running || done > 0) && (
              <div className="space-y-1">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-primary transition-[width]" style={{ width: `${eligible.length ? (done / eligible.length) * 100 : 0}%` }} />
                </div>
                <p className="text-xs tabular-nums text-muted-foreground">{t("progress", { done, total: eligible.length })}</p>
              </div>
            )}
          </div>
        )}

        <SidePanelFooter>
          {running ? (
            <Button variant="outline" onClick={() => (cancelRef.current = true)}>
              {t("stop")}
            </Button>
          ) : (
            <Button variant="outline" onClick={() => close(false)}>
              {outcome ? t("done") : tc("cancel")}
            </Button>
          )}
          {!outcome && (
            <Button onClick={run} disabled={!canRun} aria-busy={running}>
              {running && <Loader2 className="animate-spin" />}
              {channel === "EMAIL" ? t("confirmEmail", { count: eligible.length }) : t("confirmLinks", { count: eligible.length })}
            </Button>
          )}
        </SidePanelFooter>
      </SidePanelContent>
    </SidePanel>
  );
}
