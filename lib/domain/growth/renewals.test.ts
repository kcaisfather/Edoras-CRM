import { describe, expect, it } from "vitest";
import { bucketTotals, matchesBucketFilter, parseBucketFilter, renewalBucket, renewalDaysLeft, renewalEndsOn, renewalRows } from "./renewals";
import { customer, usage } from "./test-fixtures";

const NOW = new Date("2026-09-30T09:00:00Z");
const paid = (id: string, licenseEndsOn: string | null, extra: object = {}) => customer({ id, status: "UCRETLI", licenseEndsOn, ...extra });

describe("yenileme kovaları", () => {
  it("ücretli kurum: bitişe göre kova; bitiş günü dönem bitmiştir", () => {
    expect(renewalBucket(paid("a", "2026-10-05"), NOW)).toBe("d1_7");
    expect(renewalBucket(paid("b", "2026-10-14"), NOW)).toBe("d8_14");
    expect(renewalBucket(paid("c", "2026-10-30"), NOW)).toBe("d15_30");
    expect(renewalBucket(paid("d", "2026-11-29"), NOW)).toBe("d31_60");
    expect(renewalBucket(paid("e", "2026-11-30"), NOW)).toBeNull(); // 61 gün
    expect(renewalBucket(paid("f", "2026-09-30"), NOW)).toBe("expired"); // bugün bitti
  });

  it("süresi bitmiş: son 7 günde etkinlik varsa expiredActive, 90 günden eskiyse listelenmez", () => {
    const active = usage({ lastDates: { attendance: "2026-09-27" } });
    expect(renewalBucket(paid("a", "2026-09-10", { usage: active }), NOW)).toBe("expiredActive");
    expect(renewalBucket(paid("b", "2026-09-10"), NOW)).toBe("expired");
    expect(renewalBucket(paid("c", "2026-06-01", { usage: active }), NOW)).toBeNull(); // 121 gün önce
  });

  it("demo bitişi de yenileme sayılır; kayıtsız ve pasif kurum girmez", () => {
    const demo = customer({ id: "d", status: "DEMO", state: "DEMO", demoEndsAt: "2026-10-10", licenseEndsOn: null });
    expect(renewalEndsOn(demo)).toBe("2026-10-10");
    expect(renewalDaysLeft(demo, NOW)).toBe(10);
    expect(renewalBucket(demo, NOW)).toBe("d8_14");
    expect(renewalBucket(customer({ id: "k", status: null, state: "KAYITSIZ", licenseEndsOn: "2026-10-05" }), NOW)).toBeNull();
    expect(renewalBucket(paid("p", "2026-10-05", { state: "PASIF" }), NOW)).toBeNull();
    expect(renewalBucket(paid("n", null), NOW)).toBeNull();
  });

  it("süzgeç: le60 birleşik, tek kova, bilinmeyen değer → all", () => {
    expect(matchesBucketFilter("d31_60", "le60")).toBe(true);
    expect(matchesBucketFilter("expired", "le60")).toBe(false);
    expect(matchesBucketFilter("expired", "expired")).toBe(true);
    expect(matchesBucketFilter("expired", "all")).toBe(true);
    expect(parseBucketFilter("zzz")).toBe("all");
    expect(parseBucketFilter("le60")).toBe("le60");
  });

  it("satırlar: yaklaşanlar önce (en acil ilk), sonra biten (en yeni biten ilk); kova sayıları", () => {
    const rows = renewalRows([paid("far", "2026-11-20"), paid("soon", "2026-10-02"), paid("old", "2026-08-20"), paid("recent", "2026-09-25"), paid("none", null)], NOW);
    expect(rows.map((r) => r.customer.id)).toEqual(["soon", "far", "recent", "old"]);
    const totals = bucketTotals(rows);
    expect(totals.d1_7).toBe(1);
    expect(totals.d31_60).toBe(1);
    expect(totals.expired).toBe(2);
  });
});
