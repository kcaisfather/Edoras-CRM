"use client";

import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { getCrmStatusDotClass } from "@/lib/domain/crm/utils";
import type { PipelineStage } from "@/lib/domain/crm/signals";

/**
 * Satış aşamaları (G35): aşama başına aday sayısı (tutarlar üstteki özet kartlarda). Her kart bir süzgeç düğmesidir —
 * tıklayınca tablo o statüye süzülür, seçili karta tekrar tıklamak (ya da "Filtreyi temizle") süzgeci kaldırır.
 */
export function CrmPipelineStrip({
  stages,
  activeStatus,
  onSelect,
  isLoading,
}: {
  stages: PipelineStage[];
  activeStatus: string;
  onSelect: (status: string) => void;
  isLoading?: boolean;
}) {
  const t = useTranslations("crm.pipeline");
  const tStatus = useTranslations("crm.status");

  if (isLoading) return <Skeleton className="h-16 w-full rounded-2xl" />;

  const hasActive = stages.some((s) => s.status === activeStatus);

  return (
    <div className="space-y-1">
      {hasActive && (
        <div className="flex justify-end px-1">
          <button
            type="button"
            onClick={() => onSelect("")}
            className="inline-flex cursor-pointer items-center gap-1 rounded text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            <X className="h-3 w-3" aria-hidden />
            {t("clear")}
          </button>
        </div>
      )}
      <div role="group" aria-label={t("label")} className="glass-panel flex gap-1 overflow-x-auto rounded-2xl p-1.5">
        {stages.map((stage) => {
          const active = activeStatus === stage.status;
          return (
            <button
              key={stage.status}
              type="button"
              aria-pressed={active}
              title={active ? t("clearHint") : t("filterHint", { status: tStatus(stage.status) })}
              onClick={() => onSelect(active ? "" : stage.status)}
              className={cn(
                "group flex min-w-[120px] flex-1 cursor-pointer flex-col items-start rounded-xl border px-3 py-2 text-left transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                active
                  ? "border-transparent bg-primary/15 ring-1 ring-primary/50"
                  : "border-transparent hover:border-border hover:bg-accent"
              )}
            >
              <span className="flex items-center gap-1.5">
                <span className={cn("size-2 shrink-0 rounded-full", getCrmStatusDotClass(stage.status))} aria-hidden />
                <span
                  className={cn(
                    "truncate text-xs",
                    active ? "font-semibold text-primary" : "text-muted-foreground group-hover:text-foreground"
                  )}
                >
                  {tStatus(stage.status)}
                </span>
              </span>
              <span className={cn("text-sm font-semibold tabular-nums", active && "text-primary")}>{stage.count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
