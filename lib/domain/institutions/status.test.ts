import { describe, expect, it } from "vitest";
import { institutionStatus, matchesFilter, statusPriority } from "./status";
import type { CrmRecord, InstitutionListItem } from "./types";

const TODAY = "2026-09-29";

function crm(patch: Partial<CrmRecord>): CrmRecord {
  return {
    status: "DEMO",
    contactName: "Ayşe Yılmaz",
    contactPhone: "+905321234567",
    contactEmail: "ayse@kurum.test",
    demoStartedAt: "2026-09-20",
    demoEndsAt: "2026-10-04",
    convertedAt: null,
    billingComplete: false,
    billingProfileComplete: false,
    ...patch,
  };
}

function item(patch: Partial<InstitutionListItem>): Pick<InstitutionListItem, "isActive" | "crm" | "licenseEndsOn"> {
  return { isActive: true, crm: null, licenseEndsOn: null, ...patch };
}

describe("institutionStatus", () => {
  it("pasif kurum her şeyden önce gelir", () => {
    expect(institutionStatus(item({ isActive: false, crm: crm({}) }), TODAY).state).toBe("PASIF");
  });

  it("CRM kaydı yoksa kayıtsız", () => {
    expect(institutionStatus(item({}), TODAY).state).toBe("KAYITSIZ");
  });

  it("demo: kalan gün; bitiş günü geldiyse demo bitti (kurum pasif olmaz)", () => {
    expect(institutionStatus(item({ crm: crm({}) }), TODAY)).toEqual({ state: "DEMO", daysLeft: 5, licenseSoon: false });
    const ended = institutionStatus(item({ crm: crm({ demoEndsAt: TODAY }) }), TODAY);
    expect(ended).toEqual({ state: "DEMO_BITTI", daysLeft: 0, licenseSoon: false });
  });

  it("ücretli: 30 gün kala yaklaşıyor, bitiş günü lisans bitti", () => {
    const paid = crm({ status: "UCRETLI", billingComplete: true });
    expect(institutionStatus(item({ crm: paid, licenseEndsOn: "2027-06-01" }), TODAY).licenseSoon).toBe(false);
    expect(institutionStatus(item({ crm: paid, licenseEndsOn: "2026-10-29" }), TODAY)).toEqual({
      state: "UCRETLI",
      daysLeft: 30,
      licenseSoon: true,
    });
    expect(institutionStatus(item({ crm: paid, licenseEndsOn: TODAY }), TODAY).state).toBe("LISANS_BITTI");
  });
});

describe("süzgeç ve sıralama", () => {
  it("süzgeçler durumlara denk gelir", () => {
    const soon = institutionStatus(
      item({ crm: crm({ status: "UCRETLI" }), licenseEndsOn: "2026-10-10" }),
      TODAY
    );
    expect(matchesFilter(soon, "paid")).toBe(true);
    expect(matchesFilter(soon, "licenseSoon")).toBe(true);
    expect(matchesFilter(soon, "demo")).toBe(false);
  });

  it("aksiyon isteyenler önce", () => {
    const ended = institutionStatus(item({ crm: crm({ demoEndsAt: "2026-09-01" }) }), TODAY);
    const demo = institutionStatus(item({ crm: crm({}) }), TODAY);
    expect(statusPriority(ended)).toBeLessThan(statusPriority(demo));
  });
});
