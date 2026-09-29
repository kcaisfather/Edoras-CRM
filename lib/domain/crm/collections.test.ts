import { describe, expect, it } from "vitest";
import {
  collectionBlock,
  collectionsTotal,
  defaultCollectionAmount,
  latestCollectionDate,
  planCollection,
  sumByInstitution,
} from "./collections";
import type { CrmLead } from "./types";

describe("tahsilat geçmişi", () => {
  it("toplam ve son tahsilat günü", () => {
    const list = [
      { amount: 1000, date: "2026-09-01" },
      { amount: 250.5, date: "2026-09-20" },
    ];
    expect(collectionsTotal(list)).toBe(1250.5);
    expect(latestCollectionDate(list)).toBe("2026-09-20");
    expect(latestCollectionDate([])).toBeNull();
  });

  it("kurum başına ödemeleri toplar (numeric metin olarak da gelebilir)", () => {
    const sums = sumByInstitution([
      { institution_id: "a", amount: "100.10" },
      { institution_id: "a", amount: 0.2 },
      { institution_id: "b", amount: 5 },
    ]);
    expect(sums.get("a")).toBe(100.3);
    expect(sums.get("b")).toBe(5);
  });
});

describe("tahsilat ekleme planı", () => {
  const lead: CrmLead = { id: "L1", saleAmount: 1000, collectedAmount: 400, status: "SATIS_OLDU" };

  it("varsayılan tutar kalan bakiye", () => {
    expect(defaultCollectionAmount(lead)).toBe("600");
    expect(defaultCollectionAmount({ saleAmount: 100, collectedAmount: 100 })).toBe("");
  });

  it("yeni toplam, fazla ödeme ve kalan", () => {
    expect(planCollection(lead, 250)).toEqual({ nextCollected: 650, overpay: 0, balanceAfter: 350 });
    expect(planCollection(lead, 700)).toEqual({ nextCollected: 1100, overpay: 100, balanceAfter: 0 });
    expect(planCollection({ saleAmount: 100, collectedAmount: null }, 0.1 + 0.2)).toEqual({ nextCollected: 0.3, overpay: 0, balanceAfter: 99.7 });
  });
});

describe("tahsilat ön koşulu", () => {
  const crm = {
    status: "UCRETLI" as const,
    contactName: "Ali Veli",
    contactPhone: "+905321234567",
    contactEmail: "a@b.co",
    demoStartedAt: null,
    demoEndsAt: null,
    convertedAt: null,
    billingComplete: true,
  };
  const institution = {
    id: "i1",
    name: "Kurum",
    program: "yks" as const,
    isActive: true,
    missingInEdoras: false,
    isInternal: false,
    createdAt: null,
    licenseEndsOn: null,
    crm,
  };

  it("bağlı değil / CRM kaydı yok / fatura eksik / tamam", () => {
    expect(collectionBlock({})).toBe("notLinked");
    expect(collectionBlock({ institutionId: "i1" })).toBeNull(); // kurum listesi henüz gelmedi: sunucu denetler
    expect(collectionBlock({ institutionId: "i1", institution: null })).toBe("notEnrolled");
    expect(collectionBlock({ institutionId: "i1", institution: { ...institution, crm: null } })).toBe("notEnrolled");
    expect(collectionBlock({ institutionId: "i1", institution: { ...institution, crm: { ...crm, billingComplete: false } } })).toBe(
      "billingMissing"
    );
    expect(collectionBlock({ institutionId: "i1", institution })).toBeNull();
  });
});
