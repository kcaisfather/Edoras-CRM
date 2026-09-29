"use client";

import { useTranslations } from "next-intl";
import { Loader2, Square } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Toplu yazma ilerlemesi + "Durdur" (DeepSport components/import/BulkProgress). Durdurma parça sınırında olur. */
export function BulkProgress({
  done,
  total,
  stopping,
  onStop,
}: {
  done: number;
  total: number;
  stopping: boolean;
  onStop: () => void;
}) {
  const t = useTranslations("growth.import.run");
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="space-y-3" aria-live="polite">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="inline-flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          {stopping ? t("stopping") : t("progress", { done, total })}
        </span>
        <span className="tabular-nums text-muted-foreground">%{pct}</span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
      >
        <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
      </div>
      <Button variant="destructive-outline" size="sm" onClick={onStop} disabled={stopping}>
        <Square />
        {t("stop")}
      </Button>
      <p className="text-xs text-muted-foreground">{t("keepOpen")}</p>
    </div>
  );
}
