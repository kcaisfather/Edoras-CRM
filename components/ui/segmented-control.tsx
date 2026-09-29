"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface SegmentedControlOption<T extends string> {
  value: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
  disabled?: boolean;
  /** Visible label gizlendiğinde (ör. mobilde) erişilebilir ad. */
  ariaLabel?: string;
}

/**
 * Ortak segment reçetesi — SegmentedControl ve Link segmentleri (kanal sekmeleri, dönem seçici) aynı
 * boyut ve görünümü buradan alır.
 */
export const SEGMENT_GROUP = "inline-flex items-center gap-1 rounded-lg border border-border bg-muted/60 p-1";
export const SEGMENT_ITEM =
  "inline-flex h-7 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 text-xs font-medium cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-3.5 [&_svg]:shrink-0";
export const SEGMENT_ACTIVE = "bg-background text-foreground shadow-sm ring-1 ring-border/60 dark:bg-accent";
export const SEGMENT_INACTIVE = "text-muted-foreground hover:bg-background/60 hover:text-foreground";

interface SegmentedControlProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: readonly SegmentedControlOption<T>[];
  className?: string;
  itemClassName?: string;
  /** Grubun erişilebilir adı. */
  "aria-label"?: string;
}

/**
 * Tek seçimli görünüm anahtarı (periyot, kanal, kapsam, durum sekmeleri...).
 * Tüm sayfalarda aynı kap + aktif öğe görünümü için tek kaynak.
 */
export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  className,
  itemClassName,
  "aria-label": ariaLabel,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(SEGMENT_GROUP, className)}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            aria-label={option.ariaLabel}
            disabled={option.disabled}
            onClick={() => onValueChange(option.value)}
            className={cn(SEGMENT_ITEM, active ? SEGMENT_ACTIVE : SEGMENT_INACTIVE, itemClassName)}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
