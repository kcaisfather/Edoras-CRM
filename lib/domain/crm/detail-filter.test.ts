import { describe, expect, it } from "vitest";
import { detailActiveKeys, detailClientFilter, isDetailActive, leadDetailOptions, readLeadDetailFilters } from "./detail-filter";
import type { CrmLead } from "./types";

const fromQuery = (qs: string) => {
  const params = new URLSearchParams(qs);
  return readLeadDetailFilters((k) => params.get(k));
};

describe("Adaylar detaylı süzgeç — URL", () => {
  it("parametreleri okur, tanınmayan seçenekleri boş sayar", () => {
    const d = fromQuery("city=Edirne&district=Ke%C5%9Fan&phone=0532&org=kolej&program=erken&lost=PRICE&follow=today&hasPhone=yes&linked=no");
    expect(d).toMatchObject({ city: "Edirne", district: "Keşan", phone: "0532", org: "kolej", program: "erken", lost: "PRICE", follow: "today" });
    expect(d.hasPhone).toBe("yes");
    expect(d.linked).toBe("no");
    expect(d.complaint).toBe("");

    const bad = fromQuery("program=aylik&lost=FIYAT&follow=month&hasEmail=maybe");
    expect(bad).toMatchObject({ program: "", lost: "", follow: "", hasEmail: "" });
  });

  it("etkin alanlar: boşluk ve rakamsız telefon sayılmaz", () => {
    expect(isDetailActive("phone", "abc")).toBe(false);
    expect(isDetailActive("phone", "0 5")).toBe(true);
    expect(isDetailActive("org", "  ")).toBe(false);
    expect(detailActiveKeys(fromQuery("city=Edirne&phone=x&email=%20&complaint=yes"))).toEqual(["city", "complaint"]);
    expect(detailActiveKeys(fromQuery(""))).toEqual([]);
  });

  it("filterLeadsClient karşılığı: boş alan gönderilmez", () => {
    const f = detailClientFilter(fromQuery("org=kolej&contact=ayse&follow=overdue&hasEmail=no"));
    expect(f).toMatchObject({ organization: "kolej", contact: "ayse", followUp: "overdue", hasEmail: "no" });
    expect(f.city).toBeUndefined();
    expect(f.program).toBeUndefined();
  });
});

describe("Adaylar detaylı süzgeç — seçenekler", () => {
  const leads: CrmLead[] = [
    { id: "a", city: "İstanbul", district: "Kadıköy", programTags: ["yillik"] },
    { id: "b", city: "ISTANBUL", district: "Üsküdar", lostReason: "PRICE" },
    { id: "c", city: "Edirne", district: "Keşan", lostReason: "COMPETITOR" },
    { id: "d", city: " ", district: null },
  ];

  it("iller tekil ve Türkçe sıralı; ilçeler seçili ile göre", () => {
    const all = leadDetailOptions(leads, { city: "", program: "", lost: "" });
    expect(all.cities).toEqual(["Edirne", "İstanbul"]);
    expect(all.districts).toEqual(["Kadıköy", "Keşan", "Üsküdar"]);
    expect(leadDetailOptions(leads, { city: "istanbul", program: "", lost: "" }).districts).toEqual(["Kadıköy", "Üsküdar"]);
  });

  it("program ve kayıp nedeni yalnız veride olanlar (seçili olan her zaman)", () => {
    const o = leadDetailOptions(leads, { city: "", program: "erken", lost: "OTHER" });
    expect(o.programs).toEqual(["erken", "yillik"]);
    expect(o.lostReasons).toEqual(["PRICE", "COMPETITOR", "OTHER"]);
  });
});
