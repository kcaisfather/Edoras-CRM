"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DateRangePickerProps {
  startDate: string | null;
  endDate: string | null;
  onApply: (start: string, end: string) => void;
  onCancel: () => void;
  cancelLabel: string;
  applyLabel: string;
  startLabel: string;
  endLabel: string;
  prevMonthLabel?: string;
  nextMonthLabel?: string;
  locale?: string;
}

function toDateStr(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function formatDisplay(dateStr: string | null, locale: string): string {
  if (!dateStr) return "—";
  try {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(locale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export function DateRangePicker({
  startDate,
  endDate,
  onApply,
  onCancel,
  cancelLabel,
  applyLabel,
  startLabel,
  endLabel,
  prevMonthLabel,
  nextMonthLabel,
  locale = "tr",
}: DateRangePickerProps) {
  const today = new Date();
  const todayStr = toDateStr(today.getFullYear(), today.getMonth(), today.getDate());

  const [viewYear, setViewYear] = useState(() =>
    startDate ? Number(startDate.slice(0, 4)) : today.getFullYear()
  );
  const [viewMonth, setViewMonth] = useState(() =>
    startDate ? Number(startDate.slice(5, 7)) - 1 : today.getMonth()
  );
  const [localStart, setLocalStart] = useState<string | null>(startDate);
  const [localEnd, setLocalEnd] = useState<string | null>(endDate);
  const [hoverDate, setHoverDate] = useState<string | null>(null);

  const monthName = new Date(viewYear, viewMonth, 1).toLocaleDateString(locale, {
    month: "long",
    year: "numeric",
  });

  // Weekday headers (start from Sunday)
  const weekDays = Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, i + 1).toLocaleDateString(locale, { weekday: "short" }).slice(0, 1).toUpperCase()
  );

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const prevMonthDays = new Date(viewYear, viewMonth, 0).getDate();

  const cells: { day: number; currentMonth: boolean; dateStr: string }[] = [];

  for (let i = firstDay - 1; i >= 0; i--) {
    const d = prevMonthDays - i;
    const m = viewMonth === 0 ? 11 : viewMonth - 1;
    const y = viewMonth === 0 ? viewYear - 1 : viewYear;
    cells.push({ day: d, currentMonth: false, dateStr: toDateStr(y, m, d) });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, currentMonth: true, dateStr: toDateStr(viewYear, viewMonth, d) });
  }
  while (cells.length < 42) {
    const d = cells.length - firstDay - daysInMonth + 1;
    const m = viewMonth === 11 ? 0 : viewMonth + 1;
    const y = viewMonth === 11 ? viewYear + 1 : viewYear;
    cells.push({ day: d, currentMonth: false, dateStr: toDateStr(y, m, d) });
  }

  const handleDayClick = (dateStr: string) => {
    if (!localStart || (localStart && localEnd)) {
      setLocalStart(dateStr);
      setLocalEnd(null);
    } else if (dateStr < localStart) {
      setLocalEnd(localStart);
      setLocalStart(dateStr);
    } else {
      setLocalEnd(dateStr);
    }
  };

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  // Range display with hover preview
  const effectiveEnd = !localEnd && localStart && hoverDate && hoverDate >= localStart
    ? hoverDate
    : localEnd;
  const effectiveStart = !localEnd && localStart && hoverDate && hoverDate < localStart
    ? hoverDate
    : localStart;

  return (
    <div className="bg-popover text-popover-foreground rounded-2xl p-4 w-[320px] shadow-2xl border border-border">
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-3 pb-3 border-b border-border">
        <Button
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground"
          onClick={prevMonth}
          aria-label={prevMonthLabel}
          title={prevMonthLabel}
        >
          <ChevronLeft />
        </Button>
        <span className="text-sm font-semibold text-foreground capitalize" aria-live="polite">
          {monthName}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground"
          onClick={nextMonth}
          aria-label={nextMonthLabel}
          title={nextMonthLabel}
        >
          <ChevronRight />
        </Button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 mb-1">
        {weekDays.map((d, i) => (
          <div key={i} className="text-[10px] text-muted-foreground font-medium text-center py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-y-0.5 mb-3" role="grid" aria-label={monthName}>
        {cells.map((cell, i) => {
          const isStart = effectiveStart === cell.dateStr;
          const isEnd = effectiveEnd === cell.dateStr;
          const inRange =
            !!(effectiveStart && effectiveEnd && cell.dateStr > effectiveStart && cell.dateStr < effectiveEnd);
          const isToday = cell.dateStr === todayStr;
          const bothSame = isStart && isEnd;
          const isSelected = isStart || isEnd || inRange;

          return (
            <button
              key={i}
              type="button"
              role="gridcell"
              disabled={!cell.currentMonth}
              aria-label={cell.dateStr}
              aria-selected={isSelected}
              aria-current={isToday ? "date" : undefined}
              onClick={() => handleDayClick(cell.dateStr)}
              onMouseEnter={() => !localEnd && setHoverDate(cell.dateStr)}
              onMouseLeave={() => setHoverDate(null)}
              className={cn(
                "text-xs text-center py-1.5 select-none w-full cursor-pointer disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                !cell.currentMonth && "text-muted-foreground/40",
                cell.currentMonth && !isStart && !isEnd && !inRange &&
                  "text-foreground/80 hover:bg-accent rounded-full",
                inRange && "bg-primary/20 text-foreground",
                isStart && !bothSame &&
                  "bg-primary text-primary-foreground font-bold rounded-l-full shadow-md",
                isEnd && !bothSame &&
                  "bg-primary text-primary-foreground font-bold rounded-r-full shadow-md",
                bothSame && "bg-primary text-primary-foreground font-bold rounded-full shadow-md",
                isToday && !isStart && !isEnd && !inRange && "font-semibold text-primary"
              )}
            >
              {cell.day}
            </button>
          );
        })}
      </div>

      {/* Start/End inputs */}
      <div className="flex items-center gap-2 border-t border-border pt-3 mb-3">
        <div className="flex-1 bg-muted/50 border border-border rounded-lg px-2.5 py-1.5">
          <span className="block text-[9px] text-muted-foreground uppercase font-bold mb-0.5">
            {startLabel}
          </span>
          <div className="text-xs text-foreground font-mono">{formatDisplay(localStart, locale)}</div>
        </div>
        <span className="text-muted-foreground text-xs shrink-0">–</span>
        <div className="flex-1 bg-muted/50 border border-border rounded-lg px-2.5 py-1.5">
          <span className="block text-[9px] text-muted-foreground uppercase font-bold mb-0.5">
            {endLabel}
          </span>
          <div className="text-xs text-foreground font-mono">{formatDisplay(localEnd, locale)}</div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button
          size="sm"
          onClick={() => localStart && localEnd && onApply(localStart, localEnd)}
          disabled={!localStart || !localEnd}
        >
          {applyLabel}
        </Button>
      </div>
    </div>
  );
}
