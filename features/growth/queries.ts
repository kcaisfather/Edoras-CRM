"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { DEFAULT_WINDOW_DAYS, parseWindowDays } from "@/lib/domain/growth/usage";
import { DEFAULT_WEEKS } from "@/lib/domain/growth/weekly";
import { useUrlParam } from "@/lib/hooks/use-url-param";
import { growthApi } from "./api";

export const growthKeys = {
  all: ["growth"] as const,
  customers: (windowDays: number) => [...growthKeys.all, "customers", windowDays] as const,
  weekly: (weeks: number) => [...growthKeys.all, "weekly", weeks] as const,
  usage: (id: string, windowDays: number) => [...growthKeys.all, "usage", id, windowDays] as const,
};

/** Kurum başına lisans + kullanım. Sunucu Edoras okumasını 5 dk önbelleğe alır; burada da 2 dk taze sayılır. */
export function useGrowthCustomers(windowDays: number) {
  return useQuery({
    queryKey: growthKeys.customers(windowDays),
    queryFn: ({ signal }) => growthApi.customers(windowDays, signal),
    staleTime: 2 * 60 * 1000,
  });
}

/** Haftalık etkinlik serisi — ağır; yalnız `enabled` iken (bölüm açılınca) çekilir. */
export function useWeeklyActivity(enabled: boolean, weeks = DEFAULT_WEEKS) {
  return useQuery({
    queryKey: growthKeys.weekly(weeks),
    queryFn: ({ signal }) => growthApi.weekly(weeks, signal),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

export function useInstitutionUsage(id: string, windowDays = DEFAULT_WINDOW_DAYS) {
  return useQuery({
    queryKey: growthKeys.usage(id, windowDays),
    queryFn: ({ signal }) => growthApi.institutionUsage(id, windowDays, signal),
    enabled: !!id,
    staleTime: 2 * 60 * 1000,
  });
}

/** URL'deki `?window=` (7 / 30 / 90 gün) — Müşteri Takibi ve Müşteri Analizleri aynı pencereyi paylaşır. */
export function useWindowDays(): [number, (days: number) => void] {
  const [raw, setRaw] = useUrlParam("window", String(DEFAULT_WINDOW_DAYS));
  const days = useMemo(() => parseWindowDays(raw), [raw]);
  return [days, (next) => setRaw(String(next))];
}
