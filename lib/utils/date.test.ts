import { describe, expect, it } from "vitest";
import { getDateRangeByPeriod, istanbulIsoDay, parsePeriodParam, periodToRange } from "./date";

const NOW = new Date(2026, 8, 26, 15, 30); // 26 Eylül 2026, yerel

describe("periodToRange", () => {
  it("day = today, inclusive", () => {
    const r = periodToRange("day", null, null, NOW)!;
    expect(r.from).toBe(new Date(2026, 8, 26).getTime());
    expect(r.to).toBe(new Date(2026, 8, 27).getTime() - 1);
  });
  it("week / month = last 7 / 30 days including today, like the dashboard", () => {
    expect(periodToRange("week", null, null, NOW)!.from).toBe(new Date(2026, 8, 20).getTime());
    expect(periodToRange("month", null, null, NOW)!.from).toBe(new Date(2026, 7, 28).getTime());
  });
  it("custom covers the whole end day; invalid → null", () => {
    const r = periodToRange("custom", "2026-01-01", "2026-01-31", NOW)!;
    expect(r.from).toBe(new Date(2026, 0, 1).getTime());
    expect(r.to).toBe(new Date(2026, 1, 1).getTime() - 1);
    expect(periodToRange("custom", "2026-02-01", "2026-01-01", NOW)).toBeNull();
    expect(periodToRange("custom", null, "2026-01-01", NOW)).toBeNull();
  });
  it("all = no filter", () => {
    expect(periodToRange("all", null, null, NOW)).toBeNull();
  });
  it("parses params with a fallback", () => {
    expect(parsePeriodParam("month", "all")).toBe("month");
    expect(parsePeriodParam("bogus", "all")).toBe("all");
    expect(parsePeriodParam(null, "week")).toBe("week");
  });
});

describe("getDateRangeByPeriod (Istanbul calendar day)", () => {
  it("today inclusive: day 1, week 7, month 30 days", () => {
    const now = new Date("2026-10-01T09:00:00Z"); // 12:00 İstanbul
    expect(getDateRangeByPeriod("day", now)).toEqual({ from: "2026-10-01", to: "2026-10-01" });
    expect(getDateRangeByPeriod("week", now)).toEqual({ from: "2026-09-25", to: "2026-10-01" });
    expect(getDateRangeByPeriod("month", now)).toEqual({ from: "2026-09-02", to: "2026-10-01" });
  });
  it("after midnight in Istanbul the day is already the next one (UTC is still yesterday)", () => {
    const now = new Date("2026-10-01T22:30:00Z"); // 02 Ekim 01:30 İstanbul
    expect(istanbulIsoDay(now)).toBe("2026-10-02");
    expect(getDateRangeByPeriod("week", now)).toEqual({ from: "2026-09-26", to: "2026-10-02" });
  });
});

