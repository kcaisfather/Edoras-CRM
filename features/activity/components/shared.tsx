"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { AlertCircle, RotateCcw, X } from "lucide-react";
import { useRouter } from "@/lib/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { VisionListPagination } from "@/components/ui/vision-list-pagination";
import { isIsoDate } from "@/lib/domain/institutions/rules";

export const PAGE_SIZES = [10, 20, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 20;
export const ALL = "__all__";

/** Sayfa başına avatar paleti (DeepSport logAvatarClass): iki temada da okunur. */
const AVATAR_COLORS = [
  "bg-muted text-muted-foreground border-border",
  "bg-category-2/15 text-category-2 border-category-2/30",
  "bg-caution/15 text-caution border-caution/30",
  "bg-category-4/15 text-category-4 border-category-4/30",
  "bg-category-1/15 text-category-1 border-category-1/30",
  "bg-category-3/15 text-category-3 border-category-3/30",
  "bg-destructive/15 text-destructive border-destructive/30",
] as const;

export const avatarClass = (index: number) => AVATAR_COLORS[index % AVATAR_COLORS.length];

export function initialsOf(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts.length >= 2 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2)).toLocaleUpperCase("tr-TR");
}

/** "Bugün, 14:32" / "12 Eyl, 09:05" (Europe/Istanbul). */
export function formatTimestamp(iso: string, todayLabel: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" });
  const isToday = day.format(d) === day.format(new Date());
  const datePart = isToday ? todayLabel : d.toLocaleDateString("tr-TR", { month: "short", day: "numeric", timeZone: "Europe/Istanbul" });
  const timePart = d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Istanbul" });
  return `${datePart}, ${timePart}`;
}

/** URL'deki süzgeç durumu (?page=, ?size=, ?from=…). Bozuk değerler varsayılana düşer. */
export function useUrlFilters() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10) || 0);
  const sizeParam = parseInt(searchParams.get("size") ?? "", 10);
  const size = (PAGE_SIZES as readonly number[]).includes(sizeParam) ? sizeParam : DEFAULT_PAGE_SIZE;
  const fromParam = searchParams.get("from") ?? "";
  const toParam = searchParams.get("to") ?? "";
  const get = (key: string) => searchParams.get(key) ?? "";
  /** Boş değer parametreyi siler; `resetPage` sayfayı başa alır. */
  const patch = (changes: Record<string, string>, resetPage = true) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    if (resetPage) params.delete("page");
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  };
  return { get, page, size, from: isIsoDate(fromParam) ? fromParam : "", to: isIsoDate(toParam) ? toParam : "", patch };
}

export type UrlFilters = ReturnType<typeof useUrlFilters>;

export function ActivityListSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-16 w-full rounded-2xl" />
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-20 w-full rounded-2xl" />
      ))}
    </div>
  );
}

export function ActivityErrorState({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations("activityHistory");
  return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertDescription className="flex items-center justify-between gap-3">
        <span>{t("error.message")}</span>
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCcw />
          {t("error.retry")}
        </Button>
      </AlertDescription>
    </Alert>
  );
}

export function PageSizeSelect({ id, size, onChange }: { id: string; size: number; onChange: (size: string) => void }) {
  const t = useTranslations("activityHistory");
  return (
    <div className="flex items-center gap-2 lg:ml-auto">
      <label htmlFor={id} className="text-sm text-muted-foreground">
        {t("pagination.pageSize")}:
      </label>
      <Select value={String(size)} onValueChange={(v) => onChange(v === String(DEFAULT_PAGE_SIZE) ? "" : v)}>
        <SelectTrigger id={id} className="w-[100px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PAGE_SIZES.map((n) => (
            <SelectItem key={n} value={String(n)}>
              {n}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Başlangıç / bitiş tarihi (ortak). `max` bugünden ileri seçimi engeller (olaylar için). */
export function DateRangeFields({
  idPrefix,
  from,
  to,
  max,
  onChange,
}: {
  idPrefix: string;
  from: string;
  to: string;
  max?: string;
  onChange: (changes: { from?: string; to?: string }) => void;
}) {
  const t = useTranslations("activityHistory");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={`${idPrefix}-from`} className="text-sm text-muted-foreground">
        {t("filters.from")}:
      </label>
      <Input id={`${idPrefix}-from`} type="date" value={from} max={to || max} onChange={(e) => onChange({ from: e.target.value })} className="h-9 w-40" />
      <label htmlFor={`${idPrefix}-to`} className="text-sm text-muted-foreground">
        {t("filters.to")}:
      </label>
      <Input id={`${idPrefix}-to`} type="date" value={to} min={from || undefined} max={max} onChange={(e) => onChange({ to: e.target.value })} className="h-9 w-40" />
    </div>
  );
}

export function ClearFiltersButton({ onClick }: { onClick: () => void }) {
  const t = useTranslations("activityHistory");
  return (
    <Button variant="ghost" size="sm" onClick={onClick}>
      <X />
      {t("filters.clear")}
    </Button>
  );
}

export function ListPagination({
  page,
  totalPages,
  size,
  total,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  size: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const t = useTranslations("activityHistory");
  const from = total === 0 ? 0 : page * size + 1;
  const to = Math.min((page + 1) * size, total);
  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/60 pb-8 pt-6">
      <VisionListPagination
        currentPage={page}
        totalPages={totalPages}
        onPageChange={onPageChange}
        from={from}
        to={to}
        total={total}
        renderShowing={(a, b, c) => (
          <>
            <span className="font-medium text-foreground">{a}</span> - <span className="font-medium text-foreground">{b}</span>
            {t("pagination.showingMiddle")}
            <span className="font-medium text-foreground">{c}</span> {t("pagination.unit")}
          </>
        )}
        previousLabel={t("pagination.previous")}
        nextLabel={t("pagination.next")}
      />
    </div>
  );
}
