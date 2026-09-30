"use client";

import { useTranslations } from "next-intl";
import { AlertCircle, Inbox, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function CostEmptyState({ message, icon: Icon = Inbox, className }: { message?: string; icon?: typeof Inbox; className?: string }) {
  const t = useTranslations("costs.common");
  return (
    <div className={cn("flex flex-col items-center justify-center px-4 py-10 text-center", className)}>
      <div className="mb-3 rounded-2xl bg-muted p-3">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground">{message ?? t("noData")}</p>
    </div>
  );
}

export function CostErrorState({ message, onRetry, className }: { message?: string; onRetry?: () => void; className?: string }) {
  const t = useTranslations("costs.errors");
  return (
    <div className={cn("glass-panel flex items-start gap-4 rounded-2xl border-destructive/25 p-6", className)}>
      <div className="shrink-0 rounded-xl bg-destructive/10 p-2">
        <AlertCircle className="h-5 w-5 text-destructive" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{message ?? t("fetchFailed")}</p>
        {onRetry ? (
          <Button size="sm" variant="outline" onClick={onRetry} className="mt-2">
            <RotateCcw />
            {t("retry")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function CostRowsSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-xl" />
      ))}
    </div>
  );
}

/** Cam panel kabı (DeepSport kart görünümü: orb + başlık). */
export function CostPanel({ title, description, orb = "vision-card-orb-blue", actions, children, className }: { title?: React.ReactNode; description?: string; orb?: string; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("glass-panel relative overflow-hidden rounded-3xl border-border p-6", className)}>
      <div className={cn("vision-card-orb", orb)} aria-hidden />
      {title || actions ? (
        <div className="relative z-10 mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title ? <h2 className="text-base font-semibold text-foreground">{title}</h2> : null}
            {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
          </div>
          {actions}
        </div>
      ) : null}
      <div className="relative z-10">{children}</div>
    </section>
  );
}
