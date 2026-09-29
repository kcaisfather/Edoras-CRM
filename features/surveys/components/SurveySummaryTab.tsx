"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryErrorState } from "@/components/query-error-state";
import { formatCrmDate } from "@/lib/domain/crm/utils";
import { isAwaitingFollowUp } from "@/lib/domain/surveys/logic";
import { useSurveyFollowUpDays, useSurveyInvitations, useSurveySummary } from "../queries";
import { Kpi, NPS_TONE } from "./parts";

/** Özet: gönderilen, yanıt, oran, NPS, memnuniyet ortalaması, NPS dağılımı ve anket araması önerisi. */
export function SurveySummaryTab({ surveyId, onShowAwaiting }: { surveyId: string; onShowAwaiting: () => void }) {
  const t = useTranslations("surveys.summary");
  const summaryQuery = useSurveySummary(surveyId);
  const invitations = useSurveyInvitations(surveyId);
  const days = useSurveyFollowUpDays();

  const awaiting = useMemo(() => {
    const now = new Date().getTime();
    return (invitations.data?.items ?? []).filter((i) => isAwaitingFollowUp(i, now, days)).length;
  }, [invitations.data, days]);

  if (summaryQuery.isLoading || invitations.isLoading) return <Skeleton className="h-40 w-full rounded-2xl" />;
  if (summaryQuery.isError || invitations.isError || !summaryQuery.data)
    return (
      <QueryErrorState
        onRetry={() => {
          if (summaryQuery.isError) void summaryQuery.refetch();
          if (invitations.isError) void invitations.refetch();
        }}
      />
    );

  const summary = summaryQuery.data;
  const totalNps = summary.promoters + summary.passives + summary.detractors;
  const pct = (n: number) => (totalNps ? (n / totalNps) * 100 : 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label={t("invitations")} value={summary.invitationCount} />
        <Kpi
          label={t("responses")}
          value={summary.responseCount}
          hint={summary.lastResponseAt ? t("last", { date: formatCrmDate(summary.lastResponseAt) }) : undefined}
        />
        <Kpi label={t("rate")} value={summary.responseRate == null ? "—" : `%${Math.round(summary.responseRate * 100)}`} />
        <Kpi label={t("nps")} value={summary.nps == null ? "—" : summary.nps > 0 ? `+${summary.nps}` : summary.nps} info={t("npsHint")} />
        <Kpi label={t("csat")} value={summary.csatAvg == null ? "—" : `${summary.csatAvg.toLocaleString("tr-TR")}/5`} />
      </div>

      <section className="glass-panel rounded-2xl p-4 space-y-2">
        <h2 className="text-sm font-semibold">{t("distribution")}</h2>
        {totalNps === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noResponses")}</p>
        ) : (
          <>
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
              <div className="bg-success" style={{ width: `${pct(summary.promoters)}%` }} />
              <div className="bg-warning" style={{ width: `${pct(summary.passives)}%` }} />
              <div className="bg-destructive" style={{ width: `${pct(summary.detractors)}%` }} />
            </div>
            <div className="flex flex-wrap gap-4 text-xs">
              <span className={NPS_TONE.promoter}>{t("promoters", { count: summary.promoters })}</span>
              <span className={NPS_TONE.passive}>{t("passives", { count: summary.passives })}</span>
              <span className={NPS_TONE.detractor}>{t("detractors", { count: summary.detractors })}</span>
            </div>
          </>
        )}
      </section>

      {awaiting > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-warning/30 bg-warning/[0.06] px-4 py-3 text-sm">
          <span>{t("awaiting", { count: awaiting, days })}</span>
          <Button size="sm" variant="outline" onClick={onShowAwaiting}>
            {t("showAwaiting")}
          </Button>
        </div>
      )}
    </div>
  );
}
