"use client";

import type { LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface CostKpiCardProps {
  title: string;
  value: React.ReactNode;
  icon: LucideIcon;
  orbClass: string;
  iconClass?: string;
  isLoading?: boolean;
  subtitle?: string;
  trendLabel?: string;
  trendValue?: string;
  trendNegative?: boolean;
}

/** DeepSport CostKpiCard: cam panel + renkli orb + büyük değer. */
export function CostKpiCard({ title, value, icon: Icon, orbClass, iconClass = "text-primary", isLoading, subtitle, trendLabel, trendValue, trendNegative }: CostKpiCardProps) {
  return (
    <div className="glass-panel group relative flex min-h-[150px] flex-col justify-between overflow-hidden rounded-3xl border-border p-6">
      <div className={cn("vision-card-orb", orbClass)} aria-hidden />
      <div className="z-10 flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{title}</p>
          {isLoading ? (
            <Skeleton className="mt-2 h-10 w-32" />
          ) : (
            <h3 className="text-illuminated mt-2 truncate text-3xl font-light tracking-tight text-foreground md:text-4xl">{value ?? "—"}</h3>
          )}
          {subtitle && !isLoading ? <p className="mt-1.5 text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
        <div className="shrink-0 rounded-2xl border border-border bg-muted/60 p-2.5">
          <Icon className={cn("h-6 w-6", iconClass)} />
        </div>
      </div>
      {(trendLabel || trendValue) && !isLoading ? (
        <div className="z-10 mt-4 flex items-center justify-between text-xs">
          {trendLabel ? <span className="text-muted-foreground">{trendLabel}</span> : null}
          {trendValue ? <span className={cn("font-mono font-medium", trendNegative ? "text-destructive" : "text-success")}>{trendValue}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
