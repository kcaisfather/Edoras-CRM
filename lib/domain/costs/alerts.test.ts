import { describe, expect, it } from "vitest";
import { totalsByMonth, type LedgerLine } from "./aggregate";
import { budgetStatus, computeCostAlerts } from "./alerts";
import type { CostBudget } from "./types";

const line = (service: LedgerLine["service"], month: string, amountTry: number): LedgerLine => ({ service, month, amountTry });

function budget(over: Partial<CostBudget>): CostBudget {
  return {
    id: "b1",
    scope: "GLOBAL",
    service: null,
    monthlyLimitTry: 1000,
    softPct: 80,
    hardPct: 100,
    active: true,
    note: null,
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
    ...over,
  };
}

const TODAY = "2026-09-10";

describe("budgetStatus", () => {
  it("eşiklere göre durum", () => {
    const at = (spent: number) => budgetStatus(budget({}), totalsByMonth([line("SUPABASE", "2026-09", spent), line("SUPABASE", "2026-08", spent)]), TODAY).state;
    expect(at(500)).toBe("OK");
    expect(at(800)).toBe("SOFT_BREACH");
    expect(at(1000)).toBe("HARD_BREACH");
  });
  it("hizmet bütçesi yalnız o hizmeti sayar", () => {
    const totals = totalsByMonth([line("SMS", "2026-09", 900), line("SUPABASE", "2026-09", 5000)]);
    const s = budgetStatus(budget({ scope: "SERVICE", service: "SMS" }), totals, TODAY);
    expect(s.spentTry).toBe(900);
    expect(s.state).toBe("SOFT_BREACH");
    expect(s.usagePct).toBe(90);
  });
  it("harcama eşik altındayken ay sonu tahmini limiti aşarsa PROJECTED_OVERRUN", () => {
    // 10 Eylül: ayın %33'ü geçti; SMS 300 → tahmin 900 (limit 800 ise aşar; harcama %37 < soft)
    const totals = totalsByMonth([line("SMS", "2026-09", 300)]);
    const s = budgetStatus(budget({ scope: "SERVICE", service: "SMS", monthlyLimitTry: 800 }), totals, TODAY);
    expect(s.state).toBe("PROJECTED_OVERRUN");
    expect(s.forecastTry).toBe(900);
    expect(s.projectedOverrunTry).toBe(100);
  });
});

describe("computeCostAlerts", () => {
  it("sert ihlal CRITICAL, yumuşak WARN; pasif bütçe uyarı üretmez", () => {
    const totals = totalsByMonth([line("SUPABASE", "2026-09", 1200), line("SUPABASE", "2026-08", 1200), line("VERCEL", "2026-09", 850), line("VERCEL", "2026-08", 850)]);
    const alerts = computeCostAlerts(
      [
        budget({ id: "g", monthlyLimitTry: 1000 }),
        budget({ id: "s", scope: "SERVICE", service: "VERCEL", monthlyLimitTry: 1000 }),
        budget({ id: "p", scope: "SERVICE", service: "SUPABASE", monthlyLimitTry: 100, active: false }),
      ],
      totals,
      TODAY
    );
    expect(alerts.map((a) => [a.type, a.severity, a.service])).toEqual([
      ["BUDGET_HARD", "CRITICAL", null],
      ["BUDGET_SOFT", "WARN", "VERCEL"],
    ]);
  });
  it("aylık sıçrama: geçen aya göre ≥ %50 ve ≥ 250 ₺", () => {
    const totals = totalsByMonth([line("SUPABASE", "2026-08", 1000), line("SUPABASE", "2026-09", 1600), line("VERCEL", "2026-08", 100), line("VERCEL", "2026-09", 300)]);
    const alerts = computeCostAlerts([], totals, TODAY);
    // Supabase +%60 (+600) → WARN; Vercel +%200 ama yalnız +200 ₺ → küçük tutar, uyarı yok
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ type: "SPIKE", severity: "WARN", service: "SUPABASE", currentTry: 1600, thresholdTry: 1000 });
  });
  it("%100 ve üstü sıçrama CRITICAL", () => {
    const totals = totalsByMonth([line("SUPABASE", "2026-08", 1000), line("SUPABASE", "2026-09", 2500)]);
    expect(computeCostAlerts([], totals, TODAY)[0]).toMatchObject({ severity: "CRITICAL", pct: 150 });
  });
  it("geçen ay yoksa ya da düşüşte uyarı yok; kararlı kimlik", () => {
    expect(computeCostAlerts([], totalsByMonth([line("SUPABASE", "2026-09", 9000)]), TODAY)).toEqual([]);
    const a = computeCostAlerts([budget({})], totalsByMonth([line("SUPABASE", "2026-09", 2000)]), TODAY);
    expect(a[0].id).toBe("BUDGET_HARD:GLOBAL:2026-09");
  });
  it("boş defterde uyarı yok", () => {
    expect(computeCostAlerts([budget({})], totalsByMonth([]), TODAY)).toEqual([]);
  });
});
