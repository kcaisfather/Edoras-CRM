import { describe, expect, it } from "vitest";
import {
  addMonths,
  buildPackages,
  churnSummary,
  classifyPackages,
  cohortMatrix,
  continuationBreakdown,
  continuationStatus,
  coverageSpells,
  dayMs,
  lastMonths,
  monthBounds,
  monthlyChurn,
  percent,
  recentlyRenewedInstitutions,
  LOW_CONFIDENCE_MIN,
} from "./retention";
import { customer, license, usage } from "./test-fixtures";

const NOW = new Date("2026-09-30T09:00:00Z");
const nowMs = NOW.getTime();

const lic = (startsOn: string, endsOn: string, price = 12000) => license({ startsOn, endsOn, price });

describe("paketler", () => {
  it("bedelsiz lisans paket sayılmaz; aynı gün başlayan çift kayıt tek pakettir", () => {
    const pk = buildPackages([
      customer({ id: "a", licenses: [lic("2025-09-01", "2026-09-01"), lic("2025-09-01", "2026-09-01", 3000), license({ startsOn: "2024-01-01", endsOn: "2025-01-01", price: 0 })] }),
    ]);
    expect(pk).toHaveLength(1);
    expect(pk[0].price).toBe(15000);
  });

  it("geçersiz aralık (bitiş ≤ başlangıç) atlanır; fiyatı gizli (null) lisans 0 ₺ sayılır", () => {
    const pk = buildPackages([customer({ id: "a", licenses: [license({ startsOn: "2025-01-01", endsOn: "2025-01-01", price: 5 }), { startsOn: "2025-02-01", endsOn: "2026-02-01", price: null, free: false }] })]);
    expect(pk).toHaveLength(1);
    expect(pk[0].price).toBe(0);
  });
});

describe("sonuç sınıflaması", () => {
  const pkgs = buildPackages([
    customer({ id: "renewed", licenses: [lic("2024-09-01", "2025-09-01"), lic("2025-09-01", "2026-09-01")] }),
    customer({ id: "lateRenew", licenses: [lic("2024-01-01", "2025-01-01"), lic("2025-01-20", "2026-01-20")] }), // 19 gün sonra başladı → grace içinde
    customer({ id: "churned", licenses: [lic("2024-01-01", "2025-01-01")] }),
    customer({ id: "pending", licenses: [lic("2025-09-20", "2026-09-20")] }), // bitti (10 gün), grace sürüyor
    customer({ id: "active", licenses: [lic("2026-03-01", "2027-03-01")] }),
  ]);
  const results = classifyPackages(pkgs, nowMs);
  const outcome = (id: string, i = 0) => results.filter((r) => r.institutionId === id)[i].outcome;

  it("yenilendi / churn / bekleyen / süren", () => {
    expect(outcome("renewed", 0)).toBe("renewed");
    expect(outcome("renewed", 1)).toBe("pending"); // 2026-09-01 bitti, grace 10/30
    expect(outcome("lateRenew", 0)).toBe("renewed");
    expect(outcome("churned")).toBe("churned");
    expect(outcome("pending")).toBe("pending");
    expect(outcome("active")).toBe("active");
  });

  it("grace dışında başlayan yeni lisans yenileme sayılmaz", () => {
    const r = classifyPackages(buildPackages([customer({ id: "x", licenses: [lic("2024-01-01", "2025-01-01"), lic("2025-03-01", "2026-03-01")] })]), nowMs);
    expect(r[0].outcome).toBe("churned");
  });

  it("churn özeti: oranlar yalnız sonuçlananlar üzerinden; bekleyen ayrı; bedel oranı", () => {
    const s = churnSummary(results, null, nowMs);
    expect(s.renewed).toBe(2);
    expect(s.churned).toBe(2); // churned + lateRenew'in yenilenmeyen 2. paketi
    expect(s.pending).toBe(2);
    expect(s.decided).toBe(4);
    expect(s.churnRate).toBeCloseTo(0.5);
    expect(s.renewalRate).toBeCloseTo(0.5);
    expect(s.revenueChurnRate).toBeCloseTo(0.5);
    expect(s.lowConfidence).toBe(4 < LOW_CONFIDENCE_MIN);
  });

  it("aralık süzgeci bitişe göre; gelecekte biten paket sayılmaz", () => {
    const s = churnSummary(results, { from: dayMs("2025-01-01"), to: dayMs("2025-01-31") }, nowMs);
    expect(s.decided).toBe(2); // churned + lateRenew ilk paketi (ikisi de 2025-01-01'de bitti)
    expect(churnSummary(results, { from: dayMs("2027-01-01"), to: dayMs("2027-12-31") }, nowMs).ended).toBe(0);
  });

  it("boş veri: oran null", () => {
    const s = churnSummary([], null, nowMs);
    expect(s.churnRate).toBeNull();
    expect(s.renewalRate).toBeNull();
    expect(s.revenueChurnRate).toBeNull();
  });

  it("aylık trend 12 ay, eskiden yeniye", () => {
    const months = monthlyChurn(results, NOW);
    expect(months).toHaveLength(12);
    expect(months[0].month).toBe("2025-10");
    expect(months[11].month).toBe("2026-09");
    expect(months.find((m) => m.month === "2026-01")?.churned).toBe(1); // lateRenew'in 2. paketi 2026-01-20'de bitti, yenilenmedi
  });
});

describe("kohort", () => {
  it("ay farkı ekleme ay sonuna sabitlenir", () => {
    expect(new Date(addMonths(dayMs("2026-01-31"), 1)).toISOString().slice(0, 10)).toBe("2026-02-28");
    expect(new Date(addMonths(dayMs("2025-11-15"), 3)).toISOString().slice(0, 10)).toBe("2026-02-15");
  });

  it("kapsama aralıkları grace içinde birleşir", () => {
    const spells = coverageSpells(buildPackages([customer({ id: "a", licenses: [lic("2024-01-01", "2025-01-01"), lic("2025-01-10", "2026-01-10"), lic("2026-06-01", "2027-06-01")] })]));
    expect(spells).toHaveLength(2);
    expect(spells[0].end).toBe(dayMs("2026-01-10"));
  });

  it("M12'de yenilemeyen kurum düşer, yenileyen kalır (dönem [başlangıç, bitiş))", () => {
    const pkgs = buildPackages([
      customer({ id: "stay", licenses: [lic("2025-10-01", "2026-10-01")] }),
      customer({ id: "stay2", licenses: [lic("2025-10-15", "2026-10-15")] }),
    ]);
    const { rows, curve } = cohortMatrix(pkgs, NOW);
    expect(rows.map((r) => r.month)).toEqual(["2025-10"]);
    expect(rows[0].size).toBe(2);
    // M11 (2026-09-01/15) ulaşıldı ve ikisi de aktif; M12 henüz gelinmedi.
    expect(rows[0].cells[11]).toEqual({ offset: 11, ratio: { count: 2, of: 2 }, partial: false });
    expect(rows[0].cells[12]).toBeNull();
    expect(curve.at(-1)?.offset).toBe(11);
  });

  it("M12 sonrası: yenilemeyen kurum sayılmaz, yenileyen sayılır", () => {
    const pkgs = buildPackages([
      customer({ id: "stay", licenses: [lic("2024-09-01", "2025-09-01"), lic("2025-09-01", "2026-09-01")] }),
      customer({ id: "leave", licenses: [lic("2024-09-10", "2025-09-10")] }),
    ]);
    const { rows } = cohortMatrix(pkgs, NOW, { cohorts: 25 });
    const row = rows.find((r) => r.month === "2024-09");
    expect(row?.cells[12]).toEqual({ offset: 12, ratio: { count: 1, of: 2 }, partial: false });
  });

  it("aylar yardımcıları", () => {
    expect(lastMonths(3, NOW)).toEqual(["2026-09", "2026-08", "2026-07"]);
    expect(monthBounds("2026-02")).toMatchObject({ from: "2026-02-01", to: "2026-02-28" });
    expect(percent({ count: 1, of: 3 })).toBe(33);
    expect(percent({ count: 0, of: 0 })).toBeNull();
  });
});

describe("anlık devam durumu", () => {
  const renewedSet = recentlyRenewedInstitutions(
    classifyPackages(buildPackages([customer({ id: "r", licenses: [lic("2025-08-01", "2026-08-01"), lic("2026-08-15", "2027-08-15")] })]), nowMs),
    nowMs
  );
  const c = (id: string, licenseEndsOn: string, over: object = {}) => customer({ id, licenseEndsOn, usage: usage({ lastDates: { attendance: "2026-09-25" } }), ...over });

  it("son 90 günde yenileyen kurumlar", () => {
    expect(renewedSet.has("r")).toBe(true);
  });

  it("öncelik: churn → yaklaşan → yeniledi → kullanıyor / kullanmıyor", () => {
    expect(continuationStatus(c("a", "2026-09-10"), renewedSet, NOW)).toBe("churned");
    expect(continuationStatus(c("b", "2026-11-01"), renewedSet, NOW)).toBe("expiring");
    expect(continuationStatus(c("r", "2027-08-15"), renewedSet, NOW)).toBe("renewed");
    expect(continuationStatus(c("d", "2027-03-01"), renewedSet, NOW)).toBe("activeUsing");
    expect(continuationStatus(c("e", "2027-03-01", { usage: usage() }), renewedSet, NOW)).toBe("activeNotUsing");
    expect(continuationStatus(c("f", "2026-05-01"), renewedSet, NOW)).toBeNull(); // 90 günden eski
    expect(continuationStatus(customer({ id: "g", status: "DEMO", licenseEndsOn: null }), renewedSet, NOW)).toBeNull();
  });

  it("döküm: kullanan oranı yalnız süren kurumlar; süresi dolup hâlâ kullananlar", () => {
    const b = continuationBreakdown([c("a", "2026-09-10"), c("d", "2027-03-01"), c("e", "2027-03-01", { usage: usage() }), c("b", "2026-11-01")], new Set(), NOW);
    expect(b.total).toBe(4);
    expect(b.counts.churned).toBe(1);
    expect(b.churnedStillActive).toBe(1);
    expect(b.ongoingUsing).toEqual({ count: 2, of: 3 });
  });
});
