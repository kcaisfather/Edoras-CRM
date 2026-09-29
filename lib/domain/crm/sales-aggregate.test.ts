import { describe, expect, it } from "vitest";
import {
  customerKey,
  groupSalesByCustomer,
  groupSalesByMonth,
  isSaleLead,
  leadBalance,
  leadsWithBalance,
  monthKey,
  saleDate,
  salesTotals,
} from "./sales-aggregate";
import type { CrmLead } from "./types";

const lead = (over: Partial<CrmLead>): CrmLead => ({ id: "l", ...over });

const jan = new Date(2026, 0, 15).getTime();
const feb = new Date(2026, 1, 3).getTime();
const leads = [
  lead({ id: "a", updatedAt: jan, saleAmount: 1000, collectedAmount: 400, institutionId: "i1", organizationName: "Işık Koleji", contactFirstName: "Ali" }),
  lead({ id: "b", updatedAt: feb, saleAmount: 500, collectedAmount: 500, institutionId: "i1", organizationName: "Işık Koleji", contactFirstName: "Ali" }),
  lead({ id: "c", createdAt: feb, saleAmount: 300, contactEmail: "X@y.co", contactFirstName: "Veli" }),
  lead({ id: "d", status: "SATIS_OLDU" }),
  lead({ id: "e", status: "TEKLIF_VERILDI", offerAmount: 9999 }),
];

describe("satış sayılan aday ve bakiye", () => {
  it("tutarı olan ya da Satış Oldu; tahsilat yoksa 0 sayılır", () => {
    expect(leads.filter(isSaleLead).map((l) => l.id)).toEqual(["a", "b", "c", "d"]);
    expect(leadBalance(leads[0])).toBe(600);
    expect(leadBalance(leads[2])).toBe(300);
    expect(leadBalance(lead({ saleAmount: 100, collectedAmount: 250 }))).toBe(0);
  });

  it("KPI: adet, ciro, tahsilat, kalan", () => {
    expect(salesTotals(leads)).toEqual({ count: 4, amount: 1800, collected: 900, balance: 900 });
    expect(salesTotals([])).toEqual({ count: 0, amount: 0, collected: 0, balance: 0 });
  });

  it("bakiyesi olanlar bakiyeye göre azalan", () => {
    expect(leadsWithBalance(leads).map((l) => l.id)).toEqual(["a", "c"]);
  });

  it("satış tarihi: satış günü > son güncelleme > oluşturma", () => {
    expect(saleDate(lead({ soldAt: "2026-03-10", updatedAt: jan }))).toBe(new Date(2026, 2, 10).getTime());
    expect(saleDate(lead({ updatedAt: jan, createdAt: feb }))).toBe(jan);
    expect(saleDate(lead({}))).toBeNull();
  });
});

describe("kırılımlar", () => {
  it("aya göre yeniden eskiye, tarihsizler sonda", () => {
    expect(monthKey(jan)).toBe("2026-01");
    expect(monthKey(null)).toBe("");
    expect(groupSalesByMonth(leads).map((g) => [g.key, g.amount, g.count])).toEqual([
      ["2026-02", 800, 2],
      ["2026-01", 1000, 1],
      ["", 0, 1],
    ]);
  });

  it("müşteriye göre: bağlı kurum > e-posta > aday id", () => {
    expect(customerKey({ institutionId: null, contactEmail: " X@y.co ", id: "l" })).toBe("e:x@y.co");
    expect(customerKey({ institutionId: "i9", contactEmail: "a@b.co", id: "l" })).toBe("i:i9");
    const g = groupSalesByCustomer(leads);
    expect(g[0]).toMatchObject({ key: "i:i1", label: "Işık Koleji", sublabel: "Ali", amount: 1500, count: 2, balance: 600, lastDate: feb, institutionId: "i1" });
    expect(g).toHaveLength(3);
  });
});
