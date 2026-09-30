import { describe, expect, it } from "vitest";
import { allocateInstitutionCosts, marginState, splitByWeight, type AllocationInstitution } from "./allocation";

const inst = (id: string, students: number, revenueTry: number, status: string | null = "UCRETLI"): AllocationInstitution => ({
  id,
  name: `Kurum ${id}`,
  students,
  revenueTry,
  status,
});

describe("splitByWeight", () => {
  it("toplamı korur (kuruş farkı en büyük paya)", () => {
    const parts = splitByWeight(100, [1, 1, 1]);
    expect(parts.reduce((s, p) => s + p, 0)).toBeCloseTo(100, 2);
    expect(parts).toEqual([33.34, 33.33, 33.33]);
  });
  it("ağırlık yoksa sıfır", () => {
    expect(splitByWeight(100, [0, 0])).toEqual([0, 0]);
    expect(splitByWeight(0, [1, 2])).toEqual([0, 0]);
  });
});

describe("marginState", () => {
  it("gelirsiz, zarar, sınırda, sağlıklı", () => {
    expect(marginState(0, -50)).toBe("NO_REVENUE");
    expect(marginState(100, -1)).toBe("LOSS");
    expect(marginState(100, 10)).toBe("TIGHT");
    expect(marginState(100, 30)).toBe("HEALTHY");
  });
});

describe("allocateInstitutionCosts", () => {
  const base = { month: "2026-09", sharedPoolTry: 900, smsLedgerTry: 0, smsUnitPriceTry: 0 } as const;

  it("ortak maliyet öğrenci sayısıyla paylaşılır; toplam korunur", () => {
    const r = allocateInstitutionCosts({
      ...base,
      institutions: [inst("a", 300, 1000), inst("b", 100, 200), inst("c", 0, 0, "DEMO")],
      smsRecipients: new Map(),
    });
    expect(r.items.map((i) => i.sharedCostTry)).toEqual([675, 225, 0]);
    expect(r.totalCostTry).toBe(900);
    expect(r.unallocatedTry).toBe(0);
    expect(r.items[0]).toMatchObject({ marginTry: 325, margin: "HEALTHY", costPerStudentTry: 2.25 });
    expect(r.items[1]).toMatchObject({ marginTry: -25, margin: "LOSS" });
    expect(r.items[2]).toMatchObject({ margin: "NO_REVENUE", marginPct: null, costPerStudentTry: null });
  });

  it("öğrenci yoksa maliyet dağıtılmamış kalır", () => {
    const r = allocateInstitutionCosts({ ...base, institutions: [inst("a", 0, 100)], smsRecipients: new Map() });
    expect(r.unallocatedTry).toBe(900);
    expect(r.totalCostTry).toBe(0);
  });

  it("SMS: defterde satır varsa gerçek tutar alıcı payıyla bölünür", () => {
    const r = allocateInstitutionCosts({
      ...base,
      sharedPoolTry: 0,
      smsLedgerTry: 500,
      institutions: [inst("a", 10, 0), inst("b", 10, 0)],
      smsRecipients: new Map([
        ["a", 300],
        ["b", 100],
      ]),
    });
    expect(r.smsMode).toBe("LEDGER");
    expect(r.items.map((i) => i.smsCostTry)).toEqual([375, 125]);
  });

  it("SMS: defterde satır yoksa alıcı × birim fiyat (tahmin)", () => {
    const r = allocateInstitutionCosts({
      ...base,
      sharedPoolTry: 0,
      smsUnitPriceTry: 0.5,
      institutions: [inst("a", 10, 0), inst("b", 10, 0)],
      smsRecipients: new Map([
        ["a", 300],
        ["b", 100],
      ]),
    });
    expect(r.smsMode).toBe("ESTIMATE");
    expect(r.smsTotalTry).toBe(200);
    expect(r.items.map((i) => i.smsCostTry)).toEqual([150, 50]);
  });

  it("SMS: Edoras okunamadıysa defter SMS'i ortak havuza katılır, tahmin yapılmaz", () => {
    const r = allocateInstitutionCosts({
      ...base,
      sharedPoolTry: 100,
      smsLedgerTry: 200,
      smsUnitPriceTry: 1,
      institutions: [inst("a", 10, 0), inst("b", 30, 0)],
      smsRecipients: null,
    });
    expect(r.smsMode).toBe("NONE");
    expect(r.smsAvailable).toBe(false);
    expect(r.sharedPoolTry).toBe(300);
    expect(r.items.map((i) => i.sharedCostTry)).toEqual([75, 225]);
  });

  it("birim fiyat yok ve defterde SMS yoksa SMS sıfır", () => {
    const r = allocateInstitutionCosts({
      ...base,
      institutions: [inst("a", 10, 0)],
      smsRecipients: new Map([["a", 50]]),
    });
    expect(r.smsMode).toBe("NONE");
    expect(r.items[0].smsCostTry).toBe(0);
  });
});
