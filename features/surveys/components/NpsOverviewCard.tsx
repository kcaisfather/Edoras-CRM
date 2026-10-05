"use client";

/**
 * Pano kartı: genel NPS özeti (tüm anketler) — son 90 günün NPS'i, yanıt sayısı / oranı, memnuniyet ortalaması,
 * destekçi · pasif · eleştirmen dağılımı ve son 6 ayın aylık NPS eğilimi. Yalnız sayılar gösterilir.
 */
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/lib/navigation";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryErrorState } from "@/components/query-error-state";
import { cn } from "@/lib/utils";
import { useNpsOverview } from "../queries";

/** NPS rengi: ≥ 30 iyi, 0–29 orta, < 0 zayıf. */
const npsTone = (nps: number | null) => (nps == null ? "text-muted-foreground" : nps >= 30 ? "text-success" : nps >= 0 ? "text-warning" : "text-destructive");

const monthLabel = (month: string, locale: string) =>
  new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));

export function NpsOverviewCard() {
  const t = useTranslations("surveys.overview");
  const locale = useLocale();
  const q = useNpsOverview();

  return (
    <Card className="glass-panel rounded-2xl border-border/50 p-6">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">{t("title")}</h2>
        <Link href="/crm/surveys" className="text-xs text-primary underline-offset-2 hover:underline">
          {t("link")}
        </Link>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">{t("description", { days: q.data?.windowDays ?? 90 })}</p>

      {q.isLoading ? (
        <Skeleton className="h-28 w-full rounded-xl" />
      ) : q.isError || !q.data ? (
        <QueryErrorState onRetry={() => void q.refetch()} />
      ) : q.data.summary.responseCount === 0 && q.data.trend.every((m) => m.count === 0) ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <Body data={q.data} locale={locale} />
      )}
    </Card>
  );
}

function Body({ data, locale }: { data: NonNullable<ReturnType<typeof useNpsOverview>["data"]>; locale: string }) {
  const t = useTranslations("surveys.overview");
  const { summary, trend } = data;
  const total = summary.promoters + summary.passives + summary.detractors;
  const pct = (n: number) => (total ? (n / total) * 100 : 0);

  return (
    <div className="grid gap-6 md:grid-cols-[auto_1fr_1fr]">
      <div>
        <p className="text-xs text-muted-foreground">{t("nps")}</p>
        <p className={cn("text-4xl font-bold tabular-nums", npsTone(summary.nps))}>
          {summary.nps == null ? "—" : summary.nps > 0 ? `+${summary.nps}` : summary.nps}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("responses", { count: summary.responseCount })}
          {summary.responseRate != null && ` · ${t("rate", { rate: Math.round(summary.responseRate * 100) })}`}
          {summary.csatAvg != null && ` · ${t("csat", { avg: summary.csatAvg.toLocaleString(locale) })}`}
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">{t("distribution")}</p>
        {total === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noScores")}</p>
        ) : (
          <>
            <div
              className="flex h-3 w-full overflow-hidden rounded-full bg-muted"
              role="img"
              aria-label={t("distributionLabel", { promoters: summary.promoters, passives: summary.passives, detractors: summary.detractors })}
            >
              <div className="bg-success" style={{ width: `${pct(summary.promoters)}%` }} />
              <div className="bg-warning" style={{ width: `${pct(summary.passives)}%` }} />
              <div className="bg-destructive" style={{ width: `${pct(summary.detractors)}%` }} />
            </div>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <li>{t("promoters", { count: summary.promoters })}</li>
              <li>{t("passives", { count: summary.passives })}</li>
              <li>{t("detractors", { count: summary.detractors })}</li>
            </ul>
          </>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">{t("trend")}</p>
        <ol className="flex h-20 items-end gap-2" aria-label={t("trend")}>
          {trend.map((m) => (
            <li
              key={m.month}
              className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
              title={m.nps == null ? t("trendNone", { month: m.month }) : t("trendPoint", { month: m.month, nps: m.nps, count: m.count })}
            >
              {m.nps != null && (
                <>
                  <span className={cn("text-[10px] tabular-nums", npsTone(m.nps))}>{m.nps}</span>
                  <span
                    className={cn("w-full rounded-t", m.nps >= 30 ? "bg-success/70" : m.nps >= 0 ? "bg-warning/70" : "bg-destructive/70")}
                    style={{ height: `${Math.max(6, ((m.nps + 100) / 200) * 100)}%` }}
                  />
                </>
              )}
              <span className="text-[10px] text-muted-foreground">{monthLabel(m.month, locale)}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
