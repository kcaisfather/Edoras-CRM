import { describe, expect, it } from "vitest";
import { searchInstitutions } from "./search";
import type { CrmRecord } from "./types";

const crm: CrmRecord = {
  status: "DEMO",
  contactName: "Şule Işık",
  contactPhone: "+905321234567",
  contactEmail: "sule@kolej.com",
  demoStartedAt: null,
  demoEndsAt: null,
  convertedAt: null,
  billingComplete: false,
  billingProfileComplete: false,
};

const items = [
  { name: "Işıklar Koleji", crm },
  { name: "Bakırköy Açı Dershanesi", crm: null },
];

describe("searchInstitutions", () => {
  it("ad: Türkçe harf ve büyük/küçük harf duyarsız", () => {
    expect(searchInstitutions(items, "ışıklar").map((i) => i.name)).toEqual(["Işıklar Koleji"]);
    expect(searchInstitutions(items, "BAKIRKÖY").map((i) => i.name)).toEqual(["Bakırköy Açı Dershanesi"]);
  });

  it("yetkili, e-posta ve telefon", () => {
    expect(searchInstitutions(items, "şule")).toHaveLength(1);
    expect(searchInstitutions(items, "sule@")).toHaveLength(1);
    expect(searchInstitutions(items, "0532 123")).toHaveLength(1);
  });

  it("boş sorgu hepsini döner", () => {
    expect(searchInstitutions(items, "  ")).toHaveLength(2);
  });
});
