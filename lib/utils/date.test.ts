import { describe, expect, it } from "vitest";
import { parsePeriodParam, periodToRange } from "./date";

const NOW = new Date(2026, 8, 26, 15, 30); // 26 Eylül 2026, yerel

describe("periodToRange", () => {
  it("day = today, inclusive", () => {
    const r = periodToRange("day", null, null, NOW)!;
    expect(r.from).toBe(new Date(2026, 8, 26).getTime());
    expect(r.to).toBe(new Date(2026, 8, 27).getTime() - 1);
  });
  it("week / month go back 7 / 30 days like the dashboard", () => {
    expect(periodToRange("week", null, null, NOW)!.from).toBe(new Date(2026, 8, 19).getTime());
    expect(periodToRange("month", null, null, NOW)!.from).toBe(new Date(2026, 7, 27).getTime());
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
