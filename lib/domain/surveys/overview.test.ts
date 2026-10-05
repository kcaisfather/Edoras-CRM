import { describe, expect, it } from "vitest";
import { lastMonths, npsByMonth, trendStartMs } from "./overview";

const NOW = Date.parse("2026-10-15T09:00:00Z");
const at = (iso: string) => Date.parse(iso);

describe("lastMonths", () => {
  it("bu ay dahil 6 ay, eskiden yeniye; yıl sınırını aşar", () => {
    expect(lastMonths(NOW)).toEqual(["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
    expect(lastMonths(at("2026-02-10T09:00:00Z"), 4)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });
  it("İstanbul ayı: ay sonu gece yarısından sonrası ertesi aydır", () => {
    // 30 Eylül 22:00 UTC = 1 Ekim 01:00 İstanbul.
    expect(lastMonths(at("2026-09-30T22:00:00Z"), 1)).toEqual(["2026-10"]);
  });
});

describe("trendStartMs", () => {
  it("ilk ayın ilk günü İstanbul gece yarısı", () => {
    expect(new Date(trendStartMs(NOW)).toISOString()).toBe("2026-04-30T21:00:00.000Z");
  });
});

describe("npsByMonth", () => {
  it("aylık NPS: destekçi − eleştirmen; yanıtsız ay null", () => {
    const r = npsByMonth(
      [
        { nps: 10, createdAt: at("2026-10-02T09:00:00Z") },
        { nps: 9, createdAt: at("2026-10-03T09:00:00Z") },
        { nps: 3, createdAt: at("2026-10-04T09:00:00Z") },
        { nps: 8, createdAt: at("2026-10-05T09:00:00Z") },
        { nps: 6, createdAt: at("2026-08-05T09:00:00Z") },
      ],
      NOW
    );
    expect(r.find((x) => x.month === "2026-10")).toEqual({ month: "2026-10", nps: 25, count: 4 });
    expect(r.find((x) => x.month === "2026-08")).toEqual({ month: "2026-08", nps: -100, count: 1 });
    expect(r.find((x) => x.month === "2026-09")).toEqual({ month: "2026-09", nps: null, count: 0 });
    expect(r).toHaveLength(6);
  });
  it("puansız (yalnız yorum) ve pencere dışı yanıtlar sayılmaz", () => {
    const r = npsByMonth(
      [
        { nps: null, createdAt: at("2026-10-02T09:00:00Z") },
        { nps: 10, createdAt: at("2025-01-02T09:00:00Z") },
        { nps: 10, createdAt: at("2026-11-02T09:00:00Z") },
      ],
      NOW
    );
    expect(r.every((x) => x.count === 0)).toBe(true);
  });
});
