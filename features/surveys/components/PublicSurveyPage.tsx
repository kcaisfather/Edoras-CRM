"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, Clock, LinkIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/client";
import type { PublicSurveyAnswer } from "@/lib/domain/surveys/types";
import { usePublicSurvey, useSubmitPublicSurvey } from "../public";
import { SurveyForm } from "./SurveyForm";

/** Kenar çubuğu / başlık olmadan ortalanmış kart — müşterinin gördüğü tek ekran. */
function Shell({ children }: { children: React.ReactNode }) {
  const t = useTranslations("surveys.public");
  return (
    <div className="min-h-screen w-full bg-background px-4 py-8 sm:py-14">
      <div className="mx-auto w-full max-w-xl">
        <p className="mb-4 text-center text-sm font-semibold tracking-wide text-primary">{t("brand")}</p>
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-8">{children}</div>
        <p className="mt-4 text-center text-xs text-muted-foreground">{t("privacy")}</p>
      </div>
    </div>
  );
}

function Message({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <div className="text-primary [&_svg]:h-10 [&_svg]:w-10">{icon}</div>
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

const statusOf = (err: unknown): number | null => (err instanceof ApiError ? err.status : null);

/** Uçların durum kodu → ekran: 410 süresi doldu, 409 zaten yanıtlandı, 404 geçersiz link, 429 çok deneme. */
function ErrorMessage({ status }: { status: number | null }) {
  const t = useTranslations("surveys.public");
  if (status === 410) return <Message icon={<Clock />} title={t("expiredTitle")} body={t("expiredBody")} />;
  if (status === 409) return <Message icon={<CheckCircle2 />} title={t("answeredTitle")} body={t("answeredBody")} />;
  if (status === 429) return <Message icon={<Clock />} title={t("invalidTitle")} body={t("rateLimitedBody")} />;
  return <Message icon={<LinkIcon />} title={t("invalidTitle")} body={status === 404 ? t("invalidBody") : t("errorBody")} />;
}

/**
 * Herkese açık anket sayfası (/s/[token]) — oturum yok, panel kabuğu yok (lib/permissions.ts → CUSTOMER_PUBLIC_PATHS).
 * Veri yalnız /api/public/surveys/* uçlarından (çerezsiz); sayfa açılınca davet "Açıldı" olur.
 */
export function PublicSurveyPage({ token }: { token: string }) {
  const t = useTranslations("surveys.public");
  const query = usePublicSurvey(token);
  const [done, setDone] = useState<"thanks" | "already" | "expired" | null>(null);

  const submit = useSubmitPublicSurvey(token);
  const submitAnswer = (answer: PublicSurveyAnswer) =>
    submit.mutate(answer, {
      onSuccess: () => setDone("thanks"),
      onError: (err) => {
        const status = statusOf(err);
        if (status === 409) setDone("already");
        else if (status === 410) setDone("expired");
      },
    });

  if (query.isLoading) {
    return (
      <Shell>
        <div className="space-y-4 py-2" aria-busy="true" aria-label={t("loading")}>
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-10 w-32 rounded-lg" />
        </div>
      </Shell>
    );
  }

  if (done === "thanks") {
    return (
      <Shell>
        <Message icon={<CheckCircle2 />} title={t("thanksTitle")} body={t("thanksBody")} />
      </Shell>
    );
  }
  if (done === "already" || done === "expired") {
    return (
      <Shell>
        <ErrorMessage status={done === "already" ? 409 : 410} />
      </Shell>
    );
  }
  if (query.isError || !query.data) {
    return (
      <Shell>
        <ErrorMessage status={statusOf(query.error)} />
      </Shell>
    );
  }

  const survey = query.data;
  const first = survey.recipientFirstName;
  const submitFailed = submit.isError && ![409, 410].includes(statusOf(submit.error) ?? 0);
  return (
    <Shell>
      <div className="mb-6 space-y-2">
        <h1 className="text-xl font-semibold sm:text-2xl">{first ? t("greetingNamed", { name: first }) : t("greeting")}</h1>
        <p className="text-sm text-muted-foreground">{survey.intro || t("intro")}</p>
      </div>
      <SurveyForm questions={survey.questions} submitting={submit.isPending} onSubmit={submitAnswer} />
      {submitFailed && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {statusOf(submit.error) === 429 ? t("rateLimitedBody") : t("submitError")}
        </p>
      )}
    </Shell>
  );
}
