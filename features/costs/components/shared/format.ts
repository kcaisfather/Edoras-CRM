import { monthLabel } from "@/lib/domain/costs/months";
import type { CostService } from "@/lib/domain/costs/types";

const LOCALE = "tr-TR";

/** ₺ ile tutar (1.250 ₺; 100'ün altında kuruş görünür). */
export function formatLira(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency: "TRY",
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 0,
    maximumFractionDigits: Math.abs(amount) >= 100 ? 0 : 2,
  }).format(amount);
}

export function formatLiraExact(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat(LOCALE, { style: "currency", currency: "TRY", currencyDisplay: "narrowSymbol", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}

export function formatCompactLira(amount: number): string {
  if (!Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat(LOCALE, { style: "currency", currency: "TRY", currencyDisplay: "narrowSymbol", notation: "compact", maximumFractionDigits: 1 }).format(amount);
}

/** Yüzde (0–100 ölçeğinde verilen sayı). */
export function formatPct(pct: number | null | undefined, digits = 0): string {
  if (pct == null || !Number.isFinite(pct)) return "—";
  return new Intl.NumberFormat(LOCALE, { style: "percent", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(pct / 100);
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat(LOCALE).format(n);
}

export const formatMonth = (month: string) => monthLabel(month, LOCALE, "long");
export const formatMonthShort = (month: string) => monthLabel(month, LOCALE, "short");

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(LOCALE, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });
}

/** Hizmet renkleri (tema değişkenleri: açık / koyu temada okunur). */
export const SERVICE_COLORS: Record<CostService, string> = {
  SUPABASE: "hsl(var(--category-5))",
  VERCEL: "hsl(var(--category-2))",
  SMS: "hsl(var(--category-3))",
  OPENAI: "hsl(var(--category-1))",
  RESEND: "hsl(var(--category-4))",
  DOMAIN: "hsl(var(--category-7))",
  OTHER: "hsl(var(--muted-foreground))",
};

/** KPI kartı vurgu renkleri (DeepSport KPI_ORB_VARIANTS). */
export const KPI_ORBS = {
  blue: { orbClass: "vision-card-orb-blue", iconClass: "text-primary" },
  emerald: { orbClass: "vision-card-orb-emerald", iconClass: "text-success" },
  orange: { orbClass: "vision-card-orb-orange", iconClass: "text-caution" },
  purple: { orbClass: "vision-card-orb-purple", iconClass: "text-category-1" },
  pink: { orbClass: "vision-card-orb-pink", iconClass: "text-category-3" },
  teal: { orbClass: "vision-card-orb-teal", iconClass: "text-category-5" },
} as const;
