"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { BudgetState, CostAlertSeverity, CostAlertType, CostService, MarginState } from "@/lib/domain/costs/types";
import { SERVICE_COLORS } from "./format";

const PILL = "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold";

const SEVERITY_STYLE: Record<CostAlertSeverity, { badge: string; dot: string }> = {
  CRITICAL: { badge: "bg-destructive/10 text-destructive border-destructive/25", dot: "bg-destructive" },
  WARN: { badge: "bg-warning/10 text-warning border-warning/25", dot: "bg-warning" },
};

export function SeverityBadge({ severity }: { severity: CostAlertSeverity }) {
  const t = useTranslations("costs.alerts.severity");
  const style = SEVERITY_STYLE[severity];
  return (
    <span className={cn(PILL, style.badge)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", style.dot)} />
      {t(severity)}
    </span>
  );
}

export function AlertTypeBadge({ type }: { type: CostAlertType }) {
  const t = useTranslations("costs.alerts.type");
  return <span className="inline-flex items-center rounded-md border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground">{t(type)}</span>;
}

export const BUDGET_STATE_STYLE: Record<BudgetState, { badge: string; bar: string }> = {
  OK: { badge: "bg-success/10 text-success border-success/25", bar: "bg-success" },
  PROJECTED_OVERRUN: { badge: "bg-warning/10 text-warning border-warning/25", bar: "bg-warning" },
  SOFT_BREACH: { badge: "bg-caution/10 text-caution border-caution/25", bar: "bg-caution" },
  HARD_BREACH: { badge: "bg-destructive/10 text-destructive border-destructive/25", bar: "bg-destructive" },
};

export function BudgetStateBadge({ state }: { state: BudgetState }) {
  const t = useTranslations("costs.budgets.state");
  return <span className={cn(PILL, BUDGET_STATE_STYLE[state].badge)}>{t(state)}</span>;
}

const MARGIN_STYLE: Record<MarginState, string> = {
  HEALTHY: "bg-success/10 text-success border-success/25",
  TIGHT: "bg-warning/10 text-warning border-warning/25",
  LOSS: "bg-destructive/10 text-destructive border-destructive/25",
  NO_REVENUE: "bg-muted text-muted-foreground border-border",
};

export function MarginBadge({ state }: { state: MarginState }) {
  const t = useTranslations("costs.institutions.margin");
  return <span className={cn(PILL, MARGIN_STYLE[state])}>{t(state)}</span>;
}

/** Hizmet adı + renk noktası. */
export function ServiceLabel({ service, className }: { service: CostService; className?: string }) {
  const t = useTranslations("costs.services.names");
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: SERVICE_COLORS[service] }} aria-hidden />
      <span className="truncate">{t(service)}</span>
    </span>
  );
}
