"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { parsePeriodParam, periodToRange } from "@/lib/utils/date";
import { performanceApi } from "./api";

export const performanceKeys = {
  all: ["performance"] as const,
  range: (from: string, to: string) => [...performanceKeys.all, from, to] as const,
};

/** Tarayıcının yerel takvim günü (YYYY-MM-DD) — dönem seçicisi (periodToRange) yerel gün sınırlarıyla çalışır. */
function localDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Sayfanın dönem seçicisinden (?period=&startDate=&endDate=) gün aralığı. Varsayılan: son 30 gün ("month"). */
export function usePerformanceRange(): { from: string; to: string } {
  const searchParams = useSearchParams();
  const period = parsePeriodParam(searchParams.get("period"), "month");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  return useMemo(() => {
    const r = periodToRange(period === "all" ? "month" : period, startDate, endDate) ?? periodToRange("month", null, null);
    // periodToRange("month") her zaman bir aralık döner.
    return { from: localDay((r as { from: number }).from), to: localDay((r as { to: number }).to) };
  }, [period, startDate, endDate]);
}

export function usePerformance() {
  const { from, to } = usePerformanceRange();
  return { range: { from, to }, ...useQuery({ queryKey: performanceKeys.range(from, to), queryFn: ({ signal }) => performanceApi.get(from, to, signal), staleTime: 60 * 1000 }) };
}
