import { describe, expect, it } from "vitest";
import { CAMPAIGN_SEGMENTS, inSegment, renderTemplate, toCandidate } from "./campaign";
import { searchCustomers } from "./search";
import { customer, usage } from "./test-fixtures";

const NOW = new Date("2026-09-30T09:00:00Z");

const cand = (over: object) => toCandidate(customer({ id: "x", name: "Atlas Koleji", contactName: "Ayşe Yılmaz", ...over }), NOW);

describe("kampanya", () => {
  it("segmentler: etkin, yavaşlayan, yenileme yaklaşan", () => {
    const active = cand({ usage: usage({ lastDates: { attendance: "2026-09-28" } }), licenseEndsOn: "2027-05-01" });
    const slowing = cand({ usage: usage({ lastDates: { attendance: "2026-09-20" } }), licenseEndsOn: "2027-05-01" });
    const renewing = cand({ usage: usage({ lastDates: { attendance: "2026-09-29" } }), licenseEndsOn: "2026-11-15" });
    expect(inSegment(active, "active")).toBe(true);
    expect(inSegment(active, "atRisk")).toBe(false);
    expect(inSegment(slowing, "atRisk")).toBe(true);
    expect(inSegment(slowing, "active")).toBe(true);
    expect(inSegment(renewing, "renewSoon")).toBe(true);
    expect(inSegment(active, "renewSoon")).toBe(false);
    expect(CAMPAIGN_SEGMENTS.every((s) => inSegment(active, s) === (s === "all" || s === "active"))).toBe(true);
  });

  it("hiç etkinliği olmayan kurum atRisk/active değil, yalnız all", () => {
    const none = cand({});
    expect(inSegment(none, "atRisk")).toBe(false);
    expect(inSegment(none, "active")).toBe(false);
    expect(inSegment(none, "all")).toBe(true);
  });

  it("şablon: {name} yetkili adı (yoksa kurum), {organization} kurum; noktalama boşluğu düzelir", () => {
    const c = { name: "Atlas Koleji", contactName: "Ayşe Yılmaz" };
    expect(renderTemplate("Merhaba {name} , {organization} için teşekkürler !", c)).toBe("Merhaba Ayşe Yılmaz, Atlas Koleji için teşekkürler!");
    expect(renderTemplate("Merhaba {name}", { name: "Atlas Koleji", contactName: "" })).toBe("Merhaba Atlas Koleji");
  });
});

describe("müşteri araması", () => {
  const list = [
    customer({ id: "a", name: "Işık Fen Lisesi", contactName: "Ali Veli", contactEmail: "ali@isik.k12.tr", contactPhone: "+905321234567" }),
    customer({ id: "b", name: "Zirve Kolej", contactName: null, contactEmail: null, contactPhone: null }),
  ];
  it("Türkçe harf/aksan duyarsız ad, e-posta ve telefon rakamı", () => {
    expect(searchCustomers(list, "isik").map((c) => c.id)).toEqual(["a"]);
    expect(searchCustomers(list, "ALİ").map((c) => c.id)).toEqual(["a"]);
    expect(searchCustomers(list, "0532 123").map((c) => c.id)).toEqual(["a"]);
    expect(searchCustomers(list, "zirve").map((c) => c.id)).toEqual(["b"]);
    expect(searchCustomers(list, "").length).toBe(2);
    expect(searchCustomers(list, "yok")).toEqual([]);
  });
});
