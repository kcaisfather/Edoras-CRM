"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  COMMENT_MAX_LENGTH,
  CSAT_MAX,
  CSAT_MIN,
  NPS_MAX,
  NPS_MIN,
  requiredFlags,
  validateAnswer,
  type AnswerError,
} from "@/lib/domain/surveys/logic";
import type { PublicSurveyAnswer, SurveyQuestion } from "@/lib/domain/surveys/types";

const range = (min: number, max: number) => Array.from({ length: max - min + 1 }, (_, i) => min + i);

function npsTone(n: number, active: boolean) {
  if (!active) return "border-border bg-background hover:bg-accent";
  if (n >= 9) return "border-success bg-success text-white";
  if (n >= 7) return "border-warning bg-warning text-white";
  return "border-destructive bg-destructive text-white";
}

/**
 * Anket formu: NPS 0–10, memnuniyet 1–5, yorum. Herkese açık sayfa ve panel önizlemesi aynı bileşeni kullanır.
 * `preview` modunda gönder düğmesi pasiftir (panelde puan girişi yok — puanı yalnızca müşteri verir).
 */
export function SurveyForm({
  questions,
  preview = false,
  submitting = false,
  onSubmit,
}: {
  questions: SurveyQuestion[];
  preview?: boolean;
  submitting?: boolean;
  onSubmit?: (answer: PublicSurveyAnswer) => void;
}) {
  const t = useTranslations("surveys.form");
  const [answer, setAnswer] = useState<PublicSurveyAnswer>({ nps: null, csat: null, comment: "" });
  const [errors, setErrors] = useState<AnswerError[]>([]);
  const required = requiredFlags({ questions });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (preview || !onSubmit) return;
    const errs = validateAnswer(answer, required);
    setErrors(errs);
    if (errs.length === 0) onSubmit(answer);
  };

  const has = (type: SurveyQuestion["type"]) => questions.find((q) => q.type === type);
  const nps = has("NPS");
  const csat = has("CSAT");
  const comment = has("COMMENT");

  return (
    <form onSubmit={submit} className="space-y-7" noValidate>
      {nps && (
        <fieldset className="space-y-3">
          <legend className="text-base font-medium leading-snug">
            {nps.text || t("npsQuestion")}
            {nps.required && <span className="text-destructive"> *</span>}
          </legend>
          <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-11">
            {range(NPS_MIN, NPS_MAX).map((n) => {
              const active = answer.nps === n;
              return (
                <button
                  key={n}
                  type="button"
                  aria-pressed={active}
                  aria-label={t("npsAria", { n })}
                  onClick={() => setAnswer((a) => ({ ...a, nps: n }))}
                  className={cn(
                    "h-11 rounded-lg border text-sm font-semibold tabular-nums transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                    npsTone(n, active)
                  )}
                >
                  {n}
                </button>
              );
            })}
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{t("npsLow")}</span>
            <span>{t("npsHigh")}</span>
          </div>
          {errors.includes("npsRequired") && <p className="text-sm text-destructive">{t("errors.npsRequired")}</p>}
        </fieldset>
      )}

      {csat && (
        <fieldset className="space-y-3">
          <legend className="text-base font-medium leading-snug">
            {csat.text || t("csatQuestion")}
            {csat.required && <span className="text-destructive"> *</span>}
          </legend>
          <div className="grid grid-cols-5 gap-2">
            {range(CSAT_MIN, CSAT_MAX).map((n) => {
              const active = answer.csat === n;
              return (
                <button
                  key={n}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setAnswer((a) => ({ ...a, csat: n }))}
                  className={cn(
                    "flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-lg border px-1 py-2 text-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                    active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-accent"
                  )}
                >
                  <span className="text-base font-semibold tabular-nums">{n}</span>
                  <span className={cn("text-[11px] leading-tight", active ? "text-primary-foreground/90" : "text-muted-foreground")}>
                    {t(`csatLabels.${n}`)}
                  </span>
                </button>
              );
            })}
          </div>
          {errors.includes("csatRequired") && <p className="text-sm text-destructive">{t("errors.csatRequired")}</p>}
        </fieldset>
      )}

      {comment && (
        <div className="space-y-2">
          <label htmlFor="survey-comment" className="block text-base font-medium">
            {comment.text || t("commentQuestion")}
            {comment.required ? (
              <span className="text-destructive"> *</span>
            ) : (
              <span className="text-sm font-normal text-muted-foreground"> {t("optional")}</span>
            )}
          </label>
          <textarea
            id="survey-comment"
            value={answer.comment}
            maxLength={COMMENT_MAX_LENGTH}
            onChange={(e) => setAnswer((a) => ({ ...a, comment: e.target.value }))}
            rows={4}
            placeholder={t("commentPlaceholder")}
            className="flex min-h-[96px] w-full resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm"
          />
          {errors.includes("commentRequired") && <p className="text-sm text-destructive">{t("errors.commentRequired")}</p>}
        </div>
      )}

      <Button type="submit" className="h-11 w-full" disabled={preview || submitting} aria-busy={submitting}>
        {submitting && <Loader2 className="animate-spin" />}
        {preview ? t("previewSubmit") : t("submit")}
      </Button>
    </form>
  );
}
