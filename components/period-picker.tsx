"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Calendar } from "lucide-react";
import { Link, usePathname, useRouter } from "@/lib/navigation";
import { DateRangePicker } from "@/components/date-range-picker";
import { SEGMENT_ACTIVE, SEGMENT_GROUP, SEGMENT_INACTIVE, SEGMENT_ITEM } from "@/components/ui/segmented-control";
import { formatDateRangeLabel, parsePeriodParam, type PeriodParam } from "@/lib/utils/date";
import { cn } from "@/lib/utils";

const LOCALE = "tr-TR";

/**
 * Ortak dönem seçici (Tümü / Günlük / Haftalık / Aylık / Özel Aralık) — Adaylar ve Satış Analizleri
 * (DeepSportAdmin components/period-picker.tsx). Bulunulan yolda `?period=&startDate=&endDate=`
 * parametrelerini yazar; diğer parametreler korunur (`resetParams` verilenler hariç, ör. sayfa numarası).
 * useSearchParams kullanır: sayfası <Suspense> ile sarılmalı.
 */
export function PeriodPicker({
  defaultPeriod = "week",
  allowAll = false,
  resetParams = [],
}: {
  /** URL'de dönem yokken geçerli değer. */
  defaultPeriod?: PeriodParam;
  /** "Tümü" seçeneği (tarih süzgeci yok). */
  allowAll?: boolean;
  /** Dönem değişince silinecek parametreler (ör. "page"). */
  resetParams?: string[];
}) {
  const tNav = useTranslations("navigation");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const period = parsePeriodParam(searchParams.get("period"), defaultPeriod);
  const startDate = searchParams.get("startDate") || null;
  const endDate = searchParams.get("endDate") || null;

  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [pickerOpen]);

  const hrefFor = (next: PeriodParam, start?: string, end?: string) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const key of resetParams) params.delete(key);
    params.delete("startDate");
    params.delete("endDate");
    params.set("period", next);
    if (next === "custom" && start && end) {
      params.set("startDate", start);
      params.set("endDate", end);
    }
    return `${pathname}?${params.toString()}`;
  };

  const handleCustomApply = (start: string, end: string) => {
    setPickerOpen(false);
    router.push(hrefFor("custom", start, end));
  };

  const periodButtons: { key: PeriodParam; label: string }[] = [
    ...(allowAll ? [{ key: "all" as const, label: tNav("periodAll") }] : []),
    { key: "day", label: tNav("periodDaily") },
    { key: "week", label: tNav("periodWeekly") },
    { key: "month", label: tNav("periodMonthly") },
  ];

  const dateRangeLabel = period === "all" ? "" : formatDateRangeLabel(period, startDate, endDate, LOCALE);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <div role="group" aria-label={tNav("periodLabel")} className={SEGMENT_GROUP}>
        {periodButtons.map(({ key, label }) => {
          const active = period === key;
          return (
            <Link
              key={key}
              href={hrefFor(key)}
              scroll={false}
              aria-current={active ? "page" : undefined}
              className={cn(SEGMENT_ITEM, active ? SEGMENT_ACTIVE : SEGMENT_INACTIVE)}
            >
              {label}
            </Link>
          );
        })}
        <div ref={pickerRef} className="relative">
          <button
            type="button"
            aria-pressed={period === "custom"}
            aria-expanded={pickerOpen}
            className={cn(SEGMENT_ITEM, period === "custom" ? SEGMENT_ACTIVE : SEGMENT_INACTIVE)}
            onClick={() => setPickerOpen((o) => !o)}
          >
            {tNav("periodCustom")}
            {period === "custom" && <span className="size-1.5 rounded-full bg-primary" aria-hidden />}
          </button>

          {pickerOpen && (
            <div className="absolute top-full left-0 mt-3 z-50">
              <DateRangePicker
                startDate={startDate}
                endDate={endDate}
                onApply={handleCustomApply}
                onCancel={() => setPickerOpen(false)}
                cancelLabel={tNav("datePickerCancel")}
                applyLabel={tNav("datePickerApply")}
                startLabel={tNav("datePickerStart")}
                endLabel={tNav("datePickerEnd")}
                prevMonthLabel={tNav("datePickerPrevMonth")}
                nextMonthLabel={tNav("datePickerNextMonth")}
                locale={LOCALE}
              />
            </div>
          )}
        </div>
      </div>

      {dateRangeLabel && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Calendar className="size-3" aria-hidden />
          <span className="font-medium">{dateRangeLabel}</span>
        </div>
      )}
    </div>
  );
}
