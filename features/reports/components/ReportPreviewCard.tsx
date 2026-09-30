"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { InfoTip } from "@/components/ui/info-tip";
import { QueryErrorState } from "@/components/query-error-state";
import { formatCurrency } from "@/lib/domain/crm/utils";
import { renderReportText } from "@/lib/domain/reports/render";
import type { ReportFrequency, ReportSection } from "@/lib/domain/reports/types";
import { useReportPreview } from "../queries";

/**
 * Önizleme: sunucuda, GÖRÜNTÜLEYENİN rolüne göre üretilir (e-postadakiyle aynı içerik). Bölüm seçimi istemcide süzülür;
 * panoya kopyalanan metin aynı saf işlevle (renderReportText) kurulur.
 */
export function ReportPreviewCard({ frequency, sections }: { frequency: ReportFrequency; sections: readonly ReportSection[] }) {
  const t = useTranslations("settingsx.reports");
  const preview = useReportPreview(frequency);

  const shown = useMemo(() => (preview.data?.sections ?? []).filter((s) => sections.includes(s.section)), [preview.data, sections]);

  const copyText = async () => {
    if (!preview.data) return;
    try {
      await navigator.clipboard.writeText(renderReportText(shown, frequency, new Date(preview.data.generatedAt)));
      toast.success(t("preview.copied"));
    } catch {
      toast.error(t("preview.copyError"));
    }
  };

  return (
    <Card className="glass-panel rounded-2xl overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex min-w-0 items-center gap-1.5 text-base font-semibold">
            {t("preview.title")}
            <InfoTip label={t("preview.title")} align="start">
              {t("preview.subtitle", { period: t(`periods.${frequency}`) })}. {t("preview.coverage")}
            </InfoTip>
          </h3>
          <Button size="sm" variant="outline" onClick={copyText} disabled={!preview.data || shown.length === 0}>
            <Copy />
            {t("preview.copy")}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        {preview.isLoading ? (
          <Skeleton className="h-48 w-full rounded-xl" />
        ) : preview.isError ? (
          <QueryErrorState onRetry={() => void preview.refetch()} />
        ) : shown.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("preview.empty")}</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {shown.map((s) => (
              <section key={s.section} className="rounded-xl border border-border/60 p-3 space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <h4 className="text-sm font-medium">{t(`sectionLabels.${s.section}`)}</h4>
                  <p className="text-sm tabular-nums">
                    <span className="font-semibold">{s.count}</span>
                    {s.total != null && <span className="ml-2 text-xs text-muted-foreground">{formatCurrency(s.total)}</span>}
                  </p>
                </div>
                {s.lines.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("preview.none")}</p>
                ) : (
                  <ul className="space-y-1">
                    {s.lines.map((l) => (
                      <li key={l.key} className="flex items-center justify-between gap-2 text-xs">
                        <span className="min-w-0 truncate">{l.name}</span>
                        <span className="shrink-0 text-muted-foreground tabular-nums">
                          {[l.detail, l.amount != null ? formatCurrency(l.amount) : null].filter(Boolean).join(" · ")}
                        </span>
                      </li>
                    ))}
                    {s.more > 0 && <li className="text-xs text-muted-foreground">{t("preview.more", { count: s.more })}</li>}
                  </ul>
                )}
              </section>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
