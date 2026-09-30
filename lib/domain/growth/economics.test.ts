import { describe, expect, it } from "vitest";
import {
  activeLicense,
  amortizedMonthlyRevenue,
  annualRecurringRevenue,
  balanceOf,
  collectedInMonth,
  economicsSummary,
  giftRatio,
  leakageItems,
  medianLicensePrice,
  revenueTrend,
  valueRows,
} from "./economics";
import { customer, license, usage } from "./test-fixtures";

const NOW = new Date("2026-09-30T09:00:00Z");
const TODAY = "2026-09-30";

const paying = (id: string, price: number, startsOn = "2026-03-01", endsOn = "2027-03-01", payments: { amount: number; paidOn: string }[] = []) =>
  customer({ id, licenseEndsOn: endsOn, licenses: [license({ startsOn, endsOn, price })], payments });

describe("gelir", () => {
  it("bakiye: başlamış ücretli lisans bedeli − tahsilat; ödemeler bilinmiyorsa 0", () => {
    expect(balanceOf(paying("a", 12000, "2026-03-01", "2027-03-01", [{ amount: 5000, paidOn: "2026-03-05" }]), TODAY)).toBe(7000);
    expect(balanceOf(paying("b", 12000, "2026-03-01", "2027-03-01", [{ amount: 15000, paidOn: "2026-03-05" }]), TODAY)).toBe(0);
    expect(balanceOf(paying("c", 12000, "2026-11-01", "2027-11-01"), TODAY)).toBe(0); // henüz başlamadı
    expect(balanceOf({ ...paying("d", 12000), payments: null }, TODAY)).toBe(0);
  });

  it("süren lisans ve ARR: bitiş dışlayıcı, bedelsiz sayılmaz", () => {
    expect(activeLicense(paying("a", 12000, "2025-09-30", "2026-09-30"), TODAY)).toBeNull(); // bugün bitti
    const list = [paying("a", 12000), paying("b", 24000), customer({ id: "f", licenses: [license({ startsOn: "2026-01-01", endsOn: "2027-01-01", price: 0 })] })];
    expect(annualRecurringRevenue(list, TODAY)).toBe(36000);
  });

  it("aylık tahakkuk: bedel 12 aya eşit yayılır (başlangıç ayı dahil)", () => {
    const list = [paying("a", 12000, "2026-03-15", "2027-03-15")];
    expect(amortizedMonthlyRevenue(list, "2026-02")).toBe(0);
    expect(amortizedMonthlyRevenue(list, "2026-03")).toBe(1000);
    expect(amortizedMonthlyRevenue(list, "2027-02")).toBe(1000);
    expect(amortizedMonthlyRevenue(list, "2027-03")).toBe(0);
  });

  it("tahsilat ayı ve trend: yeni müşteri ilk lisans ayında sayılır", () => {
    const list = [
      paying("a", 12000, "2026-08-10", "2027-08-10", [{ amount: 6000, paidOn: "2026-08-12" }, { amount: 6000, paidOn: "2026-09-02" }]),
      paying("b", 24000, "2026-01-05", "2027-01-05"),
    ];
    expect(collectedInMonth(list, "2026-08")).toBe(6000);
    const trend = revenueTrend(list, NOW);
    expect(trend).toHaveLength(12);
    expect(trend.at(-1)?.month).toBe("2026-09");
    const aug = trend.find((m) => m.month === "2026-08");
    expect(aug).toMatchObject({ collected: 6000, newCustomers: 1, newRevenue: 12000 });
    expect(aug?.recognized).toBe(1000 + 2000);
  });

  it("özet: ARPA, MRR, tahsilat oranı, bedelsiz payı", () => {
    const list = [
      paying("a", 12000, "2026-03-01", "2027-03-01", [{ amount: 12000, paidOn: "2026-03-05" }]),
      paying("b", 24000, "2026-03-01", "2027-03-01", [{ amount: 6000, paidOn: "2026-03-05" }]),
      customer({ id: "f", licenses: [license({ startsOn: "2026-01-01", endsOn: "2027-01-01", price: 0 })], payments: [] }),
    ];
    const s = economicsSummary(list, TODAY);
    expect(s.payingCustomers).toBe(2);
    expect(s.arr).toBe(36000);
    expect(s.mrr).toBe(3000);
    expect(s.arpa).toBe(18000);
    expect(s.collection).toEqual({ count: 18000, of: 36000 });
    expect(s.outstanding).toBe(18000);
    expect(s.freeShare).toEqual({ count: 1, of: 3 });
    expect(economicsSummary([], TODAY).arpa).toBeNull();
  });

  it("değer satırları: yüksek değer önce; 14+ gündür etkinliği olmayan riskli", () => {
    const rows = valueRows(
      [
        { ...paying("small", 6000), usage: usage({ lastDates: { attendance: "2026-09-28" } }) },
        { ...paying("big", 30000), usage: usage({ lastDates: { attendance: "2026-08-01" } }) },
        customer({ id: "demo", status: "DEMO", state: "DEMO" }),
      ],
      NOW
    );
    expect(rows.map((r) => r.customer.id)).toEqual(["big", "small"]);
    expect(rows[0].atRisk).toBe(true);
    expect(rows[1].atRisk).toBe(false);
  });
});

describe("gelir sızıntısı", () => {
  it("bedelsiz lisans ve eksik tahsilat; ortanca tahmini kayıp", () => {
    const list = [
      paying("a", 10000, "2026-03-01", "2027-03-01", [{ amount: 10000, paidOn: "2026-03-05" }]),
      paying("b", 20000, "2026-03-01", "2027-03-01", [{ amount: 5000, paidOn: "2026-03-05" }]),
      customer({ id: "gift", licenses: [license({ startsOn: "2026-06-01", endsOn: "2027-06-01", price: 0 })], payments: [] }),
    ];
    expect(medianLicensePrice(list)).toBe(15000);
    const items = leakageItems(list, NOW);
    expect(items.map((i) => `${i.bucket}:${i.customer.id}`).sort()).toEqual(["freeLicense:gift", "unpaid:b"]);
    expect(items.find((i) => i.bucket === "unpaid")?.loss).toBe(15000);
    expect(items.find((i) => i.bucket === "freeLicense")?.loss).toBe(15000);
  });

  it("1 yıldan eski bedelsiz lisans sızıntı değil; ödemesi bilinmeyen (ADMIN dışı) eksik tahsilat üretmez", () => {
    const old = customer({ id: "old", licenses: [license({ startsOn: "2024-01-01", endsOn: "2025-01-01", price: 0 })], payments: [] });
    const hidden = { ...paying("h", 12000), payments: null };
    expect(leakageItems([old, hidden], NOW)).toEqual([]);
  });

  it("hediye oranı: son yılda başlayan lisanslar", () => {
    const list = [
      paying("a", 10000, "2026-03-01", "2027-03-01"),
      customer({ id: "g", licenses: [license({ startsOn: "2026-06-01", endsOn: "2027-06-01", price: 0 })] }),
      customer({ id: "old", licenses: [license({ startsOn: "2023-06-01", endsOn: "2024-06-01", price: 0 })] }),
    ];
    expect(giftRatio(list, NOW)).toEqual({ count: 1, of: 2 });
  });
});
