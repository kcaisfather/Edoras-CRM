/**
 * Bütçe durumu ve uyarılar — OKUMA ANINDA hesaplanır (DeepSport'ta zamanlayıcı bir servis üretip saklıyordu; burada
 * zamanlayıcı yok, kaydedilmiş uyarı yok, "onayla / çöz" yok). Saf; testler alerts.test.ts.
 *
 * Uyarı türleri:
 *  - BUDGET_HARD      harcama ≥ sert eşik (limit × hardPct)                       → CRITICAL
 *  - BUDGET_SOFT      harcama ≥ yumuşak eşik (limit × softPct), sert eşik altı   → WARN
 *  - BUDGET_PROJECTED ay sonu tahmini limiti aşıyor, harcama henüz eşiklerin altında → WARN
 *  - SPIKE            hizmetin ay sonu tahmini geçen aya göre ≥ %50 ve ≥ 250 ₺ artmış (≥ %100 → CRITICAL)
 * Tahmin: aggregate.ts → forecastService (kullanıma bağlı hizmetler hızla, sabit kalemler max(girilen, geçen ay)).
 */
import { forecastByService, forecastTotal, monthTotal, serviceTotal, type MonthTotals } from "./aggregate";
import { addMonthsKey, monthOfDay } from "./months";
import {
  COST_SERVICES,
  type BudgetState,
  type BudgetStatus,
  type CostAlert,
  type CostAlertSeverity,
  type CostBudget,
} from "./types";

export const SPIKE_WARN_PCT = 50;
export const SPIKE_CRITICAL_PCT = 100;
/** Küçük tutarların yüzde oynaması uyarı üretmesin. */
export const SPIKE_MIN_INCREASE_TRY = 250;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Bir bütçenin içinde bulunulan aydaki durumu. Pasif bütçe de hesaplanır (ekranda soluk gösterilir), uyarı üretmez. */
export function budgetStatus(budget: CostBudget, totals: MonthTotals, today: string): BudgetStatus {
  const month = monthOfDay(today);
  const spent = budget.scope === "GLOBAL" ? monthTotal(totals, month) : serviceTotal(totals, month, budget.service ?? "OTHER");
  const forecast = budget.scope === "GLOBAL" ? forecastTotal(totals, today) : forecastByService(totals, today)[budget.service ?? "OTHER"];
  const usagePct = (spent / budget.monthlyLimitTry) * 100;
  let state: BudgetState = "OK";
  if (usagePct >= budget.hardPct) state = "HARD_BREACH";
  else if (usagePct >= budget.softPct) state = "SOFT_BREACH";
  else if (forecast > budget.monthlyLimitTry) state = "PROJECTED_OVERRUN";
  return {
    budgetId: budget.id,
    scope: budget.scope,
    service: budget.service,
    active: budget.active,
    monthlyLimitTry: budget.monthlyLimitTry,
    softPct: budget.softPct,
    hardPct: budget.hardPct,
    spentTry: round2(spent),
    forecastTry: round2(forecast),
    usagePct,
    projectedOverrunTry: round2(Math.max(0, forecast - budget.monthlyLimitTry)),
    state,
  };
}

const SEVERITY_RANK: Record<CostAlertSeverity, number> = { CRITICAL: 0, WARN: 1 };

/** İçinde bulunulan ay için tüm uyarılar (CRITICAL önce, sonra tutara göre azalan). */
export function computeCostAlerts(budgets: readonly CostBudget[], totals: MonthTotals, today: string): CostAlert[] {
  const month = monthOfDay(today);
  const alerts: CostAlert[] = [];

  for (const budget of budgets) {
    if (!budget.active) continue;
    const s = budgetStatus(budget, totals, today);
    const scopeKey = budget.scope === "GLOBAL" ? "GLOBAL" : (budget.service ?? "OTHER");
    const base = { service: budget.service, month, thresholdTry: budget.monthlyLimitTry, pct: s.usagePct };
    if (s.state === "HARD_BREACH") {
      alerts.push({ ...base, id: `BUDGET_HARD:${scopeKey}:${month}`, type: "BUDGET_HARD", severity: "CRITICAL", currentTry: s.spentTry });
    } else if (s.state === "SOFT_BREACH") {
      alerts.push({ ...base, id: `BUDGET_SOFT:${scopeKey}:${month}`, type: "BUDGET_SOFT", severity: "WARN", currentTry: s.spentTry });
    } else if (s.state === "PROJECTED_OVERRUN") {
      alerts.push({
        ...base,
        id: `BUDGET_PROJECTED:${scopeKey}:${month}`,
        type: "BUDGET_PROJECTED",
        severity: "WARN",
        currentTry: s.forecastTry,
        pct: (s.forecastTry / budget.monthlyLimitTry) * 100,
      });
    }
  }

  const previousMonth = addMonthsKey(month, -1);
  const forecasts = forecastByService(totals, today);
  for (const service of COST_SERVICES) {
    const previous = serviceTotal(totals, previousMonth, service);
    const current = forecasts[service];
    if (previous <= 0) continue;
    const increase = current - previous;
    const pct = (increase / previous) * 100;
    if (pct >= SPIKE_WARN_PCT && increase >= SPIKE_MIN_INCREASE_TRY) {
      alerts.push({
        id: `SPIKE:${service}:${month}`,
        type: "SPIKE",
        severity: pct >= SPIKE_CRITICAL_PCT ? "CRITICAL" : "WARN",
        service,
        month,
        currentTry: current,
        thresholdTry: previous,
        pct,
      });
    }
  }

  return alerts.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.currentTry - a.currentTry);
}
