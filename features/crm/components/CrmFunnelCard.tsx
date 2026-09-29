"use client";

import { useTranslations } from "next-intl";
import { ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { InfoTip } from "@/components/ui/info-tip";
import type { FunnelStep } from "@/lib/domain/crm/insights";

const fmtPct = (v: number | null) => (v == null ? "—" : `%${v.toLocaleString("tr-TR")}`);

/**
 * Satış hunisi (G82): aday → demo → satış süreci → aktif müşteri; adet, adım ve genel dönüşüm.
 * Tarih aralığı filtresini izler (aday oluşturma kohortu).
 */
export function CrmFunnelCard({ steps, isLoading }: { steps: FunnelStep[]; isLoading?: boolean }) {
  const t = useTranslations("crm.funnel");

  if (isLoading) return <Skeleton className="h-20 w-full rounded-2xl" />;

  return (
    <section aria-label={t("label")} className="glass-panel rounded-2xl p-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          {t("label")}
          <InfoTip label={t("label")} align="start">
            {t("hint")}
          </InfoTip>
        </h2>
      </div>
      <ol className="flex flex-wrap items-stretch gap-1">
        {steps.map((step, i) => (
          <li key={step.key} className="flex min-w-[130px] flex-1 items-center gap-1">
            {i > 0 && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
            <div className="flex-1 rounded-xl bg-background/60 px-3 py-2 dark:bg-accent/40">
              <p className="truncate text-xs text-muted-foreground">{t(`stage.${step.key}`)}</p>
              <p className="text-sm font-semibold tabular-nums">{step.count}</p>
              {i > 0 && (
                <p className="text-xs tabular-nums text-muted-foreground">
                  {t("stepRate", { rate: fmtPct(step.stepRate) })} · {t("overallRate", { rate: fmtPct(step.overallRate) })}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
