import { describe, expect, it } from "vitest";
import { reportPreviewQuerySchema, reportSubscriptionInputSchema } from "./schemas";
import { REPORT_SECTIONS } from "./types";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

const base = { name: "Sabah", recipientIds: [A], frequency: "DAILY", time: "08:30", sections: ["salesTotal", "todayTasks"] };

describe("reportSubscriptionInputSchema", () => {
  it("geçerli girdiyi kabul eder; bölümleri e-posta sırasına dizer, kullanılmayan günü boşaltır", () => {
    const r = reportSubscriptionInputSchema.parse({ ...base, weekday: 3, dayOfMonth: 5 });
    expect(r.sections).toEqual(["todayTasks", "salesTotal"]);
    expect(r.weekday).toBeNull();
    expect(r.dayOfMonth).toBeNull();
    expect(r.active).toBe(true);
  });
  it("haftalıkta gün, aylıkta ayın günü zorunlu", () => {
    expect(reportSubscriptionInputSchema.safeParse({ ...base, frequency: "WEEKLY" }).success).toBe(false);
    expect(reportSubscriptionInputSchema.safeParse({ ...base, frequency: "MONTHLY" }).success).toBe(false);
    const w = reportSubscriptionInputSchema.parse({ ...base, frequency: "WEEKLY", weekday: 7, dayOfMonth: 9 });
    expect([w.weekday, w.dayOfMonth]).toEqual([7, null]);
    const m = reportSubscriptionInputSchema.parse({ ...base, frequency: "MONTHLY", dayOfMonth: 28, weekday: 2 });
    expect([m.weekday, m.dayOfMonth]).toEqual([null, 28]);
    expect(reportSubscriptionInputSchema.safeParse({ ...base, frequency: "MONTHLY", dayOfMonth: 29 }).success).toBe(false);
  });
  it("saat, alıcı ve bölüm kuralları", () => {
    expect(reportSubscriptionInputSchema.safeParse({ ...base, time: "8:30" }).success).toBe(false);
    expect(reportSubscriptionInputSchema.safeParse({ ...base, recipientIds: [] }).success).toBe(false);
    expect(reportSubscriptionInputSchema.safeParse({ ...base, recipientIds: [A, A.toUpperCase()] }).success).toBe(false);
    expect(reportSubscriptionInputSchema.safeParse({ ...base, recipientIds: ["ali@firma.com"] }).success).toBe(false);
    expect(reportSubscriptionInputSchema.safeParse({ ...base, recipientIds: [A, B] }).success).toBe(true);
    expect(reportSubscriptionInputSchema.safeParse({ ...base, sections: [] }).success).toBe(false);
    expect(reportSubscriptionInputSchema.safeParse({ ...base, sections: ["bogus"] }).success).toBe(false);
    expect(reportSubscriptionInputSchema.safeParse({ ...base, name: "  " }).success).toBe(false);
  });
  it("serbest e-posta adresi alan yoktur (alıcı yalnız personel kimliği)", () => {
    const r = reportSubscriptionInputSchema.parse({ ...base, recipients: ["dis@ornek.com"] });
    expect(r).not.toHaveProperty("recipients");
  });
});

describe("reportPreviewQuerySchema", () => {
  it("bölüm verilmezse hepsi; sıklık varsayılanı günlük", () => {
    const r = reportPreviewQuerySchema.parse({});
    expect(r.sections).toEqual([...REPORT_SECTIONS]);
    expect(r.frequency).toBe("DAILY");
  });
  it("virgülle ayrılmış bölümler; bilinmeyen reddedilir", () => {
    expect(reportPreviewQuerySchema.parse({ sections: "openOffers,newSignups", frequency: "WEEKLY" })).toEqual({ sections: ["openOffers", "newSignups"], frequency: "WEEKLY" });
    expect(reportPreviewQuerySchema.safeParse({ sections: "x" }).success).toBe(false);
  });
});
