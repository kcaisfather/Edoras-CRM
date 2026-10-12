"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Kurum ayrıntısı başlığındaki gösterge şeridi. Izgara `auto-fit`: kutucuk sayısı duruma göre değişse de (demo / lisans
 * kutucuğu yok, büyüme kutucukları yüklenmedi…) satır boşluksuz dolar. 8.5rem: 375 px'te kart içi ~303 px → iki sütun
 * (9.5rem tek sütuna düşürüyordu).
 */
export const STAT_GRID = "grid grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))] gap-2.5 sm:gap-3";

/**
 * Gösterge kutucuğu (öğrenci / öğretmen / etkinlik / demo kalan gün…). Başka modüller (ör. büyümenin etkinlik
 * kutucukları) başlığa aynı görünümle katılsın diye dışa açık. `children`: değerin altına ek parça (ör. süre çubuğu).
 */
export function StatTile({
  icon: Icon,
  label,
  value,
  hint,
  tone,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  /** Değerin rengi (ör. `text-warning`). */
  tone?: string;
  title?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-border/70 bg-background/60 px-3 py-2.5 sm:px-4 sm:py-3" title={title}>
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{label}</span>
      </p>
      <div className={cn("mt-1.5 truncate text-lg font-bold leading-tight tracking-tight tabular-nums sm:text-2xl", tone)}>{value}</div>
      {hint ? <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{hint}</div> : null}
      {children}
    </div>
  );
}

export function StatTileSkeleton() {
  return <Skeleton className="h-[88px] rounded-xl" />;
}

/** İnce süre çubuğu (demo / lisans döneminin geçen kısmı). `value` 0–1. */
export function StatProgress({ value, tone, label }: { value: number; tone?: string; label: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
    >
      <div className={cn("h-full rounded-full bg-primary", tone)} style={{ width: `${pct}%` }} />
    </div>
  );
}
