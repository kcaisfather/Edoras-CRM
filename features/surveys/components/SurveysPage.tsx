"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Eye, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { InfoTip } from "@/components/ui/info-tip";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryErrorState } from "@/components/query-error-state";
import type { Survey } from "@/lib/domain/surveys/types";
import { useDefaultSurvey } from "../queries";
import { SendSurveyDialog } from "./SendSurveyDialog";
import { SurveyForm } from "./SurveyForm";
import { SurveyInvitationsTab, type InvFilter } from "./SurveyInvitationsTab";
import { SurveyResponsesTab } from "./SurveyResponsesTab";
import { SurveySummaryTab } from "./SurveySummaryTab";

type Tab = "summary" | "invitations" | "responses" | "survey";
const TABS: Tab[] = ["summary", "invitations", "responses", "survey"];

/**
 * Anketler (/crm/surveys; DeepSport madde 6): varsayılan anket, gönderim, davet ve yanıt listeleri, özet. Her CRM
 * kullanıcısı (DeepSport'ta da ADMIN ve CRM_AGENT). Puanı yalnız müşteri verir; bu ekranda puan giriş alanı yoktur.
 */
export function SurveysPage() {
  const t = useTranslations("surveys");
  const [tab, setTab] = useState<Tab>("summary");
  const [invFilter, setInvFilter] = useState<InvFilter>("all");
  const [sendOpen, setSendOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const defaultSurvey = useDefaultSurvey();
  const { survey } = defaultSurvey;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("page.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("page.subtitle")}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant="outline" onClick={() => setPreviewOpen(true)} disabled={!survey}>
            <Eye />
            {t("page.preview")}
          </Button>
          <Button onClick={() => setSendOpen(true)} disabled={!survey}>
            <Send />
            {t("page.send")}
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <SegmentedControl<Tab>
          value={tab}
          onValueChange={setTab}
          aria-label={t("page.tabsLabel")}
          options={TABS.map((v) => ({ value: v, label: t(`tabs.${v}`) }))}
        />
      </div>

      {/* Anket kimliği gelmeden sekmeler istek atamaz; sıfır göstermek yerine bekle / hata göster. */}
      {defaultSurvey.isLoading ? (
        <Skeleton className="h-40 w-full rounded-2xl" />
      ) : defaultSurvey.isError ? (
        <QueryErrorState onRetry={() => void defaultSurvey.refetch()} />
      ) : !survey ? (
        <p className="rounded-2xl border border-border bg-card/60 p-4 text-sm text-muted-foreground">{t("page.noSurvey")}</p>
      ) : (
        <>
          {tab === "summary" && (
            <SurveySummaryTab
              surveyId={survey.id}
              onShowAwaiting={() => {
                setInvFilter("awaiting");
                setTab("invitations");
              }}
            />
          )}
          {tab === "invitations" && (
            <SurveyInvitationsTab surveyId={survey.id} mailEnabled={defaultSurvey.mailEnabled} filter={invFilter} onFilter={setInvFilter} />
          )}
          {tab === "responses" && <SurveyResponsesTab surveyId={survey.id} />}
          {tab === "survey" && <SurveyDefinition survey={survey} />}
        </>
      )}

      <SendSurveyDialog open={sendOpen} onOpenChange={setSendOpen} />

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("page.previewTitle")}</DialogTitle>
            <DialogDescription>{t("page.previewNote")}</DialogDescription>
          </DialogHeader>
          {survey && <SurveyForm questions={survey.questions} preview />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SurveyDefinition({ survey }: { survey: Survey }) {
  const t = useTranslations("surveys");
  const tf = useTranslations("surveys.form");
  const questionText = (type: string, text?: string | null) =>
    text || (type === "NPS" ? tf("npsQuestion") : type === "CSAT" ? tf("csatQuestion") : tf("commentQuestion"));
  return (
    <section className="glass-panel rounded-2xl p-4 sm:p-5 space-y-3">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold">
        {survey.title || t("definition.title")}
        <InfoTip label={t("definition.title")} align="start">
          {t("definition.subtitle", { days: survey.linkValidDays })}
        </InfoTip>
      </h2>
      {survey.intro && <p className="text-sm text-muted-foreground">{survey.intro}</p>}
      <ol className="space-y-2">
        {survey.questions.map((q, i) => (
          <li key={q.id} className="flex gap-3 rounded-lg border border-border bg-background/60 px-3 py-2">
            <span className="text-sm font-semibold tabular-nums text-muted-foreground">{i + 1}.</span>
            <div className="min-w-0">
              <p className="text-sm">{questionText(q.type, q.text)}</p>
              <p className="text-xs text-muted-foreground">
                {t(`definition.types.${q.type}`)} · {q.required ? t("definition.required") : t("definition.optional")}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
