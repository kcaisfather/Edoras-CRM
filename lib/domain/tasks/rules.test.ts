import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_RULES,
  describeRuleChanges,
  followUpSuggestDays,
  isDefaultRules,
  normalizeRules,
  ruleMap,
  TASK_KINDS,
} from "./rules";

describe("rules", () => {
  it("bilinmeyen / geçersiz girdiyi varsayılana çevirir, günleri sınırlar", () => {
    expect(normalizeRules(null)).toEqual(DEFAULT_RULES);
    const n = normalizeRules([
      { id: "offer", days: -4, enabled: false },
      { id: "nope", days: 1 },
      { id: "quotaHigh", days: 90 },
      { id: "scheduled", days: 9 },
    ]);
    expect(n.find((r) => r.id === "offer")).toEqual({ id: "offer", enabled: false, days: 0 });
    expect(n.find((r) => r.id === "scheduled")?.days).toBe(0);
    expect(n).toHaveLength(DEFAULT_RULES.length);
    expect(n.some((r) => (r.id as string) === "quotaHigh")).toBe(false);
    expect(normalizeRules([{ id: "annualRenewal", days: 9999 }]).find((r) => r.id === "annualRenewal")?.days).toBe(365);
    expect(normalizeRules([{ id: "balance", days: "12" }]).find((r) => r.id === "balance")?.days).toBe(12);
    expect(normalizeRules([{ id: "balance", days: "x", enabled: "evet" }]).find((r) => r.id === "balance")).toEqual({
      id: "balance",
      enabled: true,
      days: 7,
    });
  });

  it("Edoras varsayılanları (demo ve lisans 1 yıl)", () => {
    const r = ruleMap(DEFAULT_RULES);
    expect([r.offer.days, r.demoEnding.days, r.annualRenewal.days, r.lostRecontact.days, r.surveyNoResponse.days]).toEqual([3, 30, 60, 90, 5]);
    expect([r.expired.days, r.balance.days, r.undatedFollowUp.days, r.coldList.days]).toEqual([0, 7, 0, 2]);
    expect(DEFAULT_RULES.every((x) => x.enabled)).toBe(true);
    expect(DEFAULT_RULES.map((x) => x.id)).toEqual([...TASK_KINDS]);
    expect(isDefaultRules(DEFAULT_RULES)).toBe(true);
    expect(isDefaultRules([{ id: "offer", enabled: true, days: 4 }])).toBe(false);
  });

  it("varsayılanlar migration'daki ilk değerlerle aynı", () => {
    const sql = readFileSync(
      fileURLToPath(new URL("../../../supabase/migrations/20260929170000_crm_tasks.sql", import.meta.url)),
      "utf8"
    );
    const block = /insert into public\.crm_rules \(id, enabled, days\) values([\s\S]*?)on conflict/.exec(sql)?.[1] ?? "";
    const seeded = [...block.matchAll(/\('(\w+)', (true|false), (\d+)\)/g)].map((m) => ({
      id: m[1],
      enabled: m[2] === "true",
      days: Number(m[3]),
    }));
    expect(seeded).toEqual(DEFAULT_RULES);
  });

  it("değişiklik özeti (işlem kaydı)", () => {
    const next = normalizeRules([
      { id: "offer", enabled: true, days: 5 },
      { id: "balance", enabled: false, days: 7 },
    ]);
    expect(describeRuleChanges(DEFAULT_RULES, next)).toEqual(["offer.days 3→5", "balance.enabled true→false"]);
    expect(describeRuleChanges(DEFAULT_RULES, DEFAULT_RULES)).toEqual([]);
  });

  it("statü seçilince önerilen sonraki arama kurallardan", () => {
    expect(followUpSuggestDays(DEFAULT_RULES)).toEqual({ TEKLIF_VERILDI: 3, OLUMSUZ: 90 });
    const custom = normalizeRules([
      { id: "offer", enabled: false, days: 3 },
      { id: "lostRecontact", enabled: true, days: 120 },
    ]);
    expect(followUpSuggestDays(custom)).toEqual({ OLUMSUZ: 120 });
  });
});
