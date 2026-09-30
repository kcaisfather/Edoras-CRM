import { describe, expect, it } from "vitest";
import { inSegment, isCustomerSegment, segmentCounts } from "./segments";
import { customer, usage } from "./test-fixtures";

const NOW = new Date("2026-09-30T09:00:00Z");

describe("kurum segmentleri", () => {
  it("öğrenci eklememiş / öğretmeni olmayan", () => {
    expect(inSegment(customer({ id: "a", usage: usage({ students: 0 }) }), "noStudents", NOW)).toBe(true);
    expect(inSegment(customer({ id: "b", usage: usage({ students: 3 }) }), "noStudents", NOW)).toBe(false);
    expect(inSegment(customer({ id: "c", usage: usage({ teachers: 0 }) }), "noTeachers", NOW)).toBe(true);
  });

  it("pasif kurum ve kullanımı hesaplanmamış kurum hiçbir segmentte değil", () => {
    expect(inSegment(customer({ id: "a", state: "PASIF", usage: usage({ students: 0 }) }), "noStudents", NOW)).toBe(false);
    expect(inSegment(customer({ id: "b", usage: null }), "noStudents", NOW)).toBe(false);
  });

  it("hiç aktive olmamış: etkinlik yok ve eski", () => {
    expect(inSegment(customer({ id: "a", createdAt: "2026-05-01T00:00:00Z" }), "neverActivated", NOW)).toBe(true);
    expect(inSegment(customer({ id: "b", createdAt: "2026-05-01T00:00:00Z", usage: usage({ lastDates: { sms: "2026-09-01" } }) }), "neverActivated", NOW)).toBe(false);
  });

  it("90+ gündür etkinliği olmayan ödeyenler: yalnız lisansı süren ücretli kurum", () => {
    const paid = (over: object) => customer({ id: "p", state: "UCRETLI", ...over });
    expect(inSegment(paid({ usage: usage({ lastDates: { attendance: "2026-05-01" } }) }), "dormantPayers", NOW)).toBe(true);
    expect(inSegment(paid({ usage: usage() }), "dormantPayers", NOW)).toBe(true); // hiç etkinlik
    expect(inSegment(paid({ usage: usage({ lastDates: { attendance: "2026-09-20" } }) }), "dormantPayers", NOW)).toBe(false);
    expect(inSegment(paid({ state: "DEMO", usage: usage() }), "dormantPayers", NOW)).toBe(false);
    expect(inSegment(paid({ state: "LISANS_BITTI", usage: usage() }), "dormantPayers", NOW)).toBe(false);
  });

  it("segment sayıları ve tür koruması", () => {
    const list = [customer({ id: "a", usage: usage({ students: 0 }) }), customer({ id: "b", usage: usage({ students: 0, teachers: 0 }) }), customer({ id: "c" })];
    const counts = segmentCounts(list, NOW);
    expect(counts.noStudents).toBe(2);
    expect(counts.noTeachers).toBe(1);
    expect(isCustomerSegment("noStudents")).toBe(true);
    expect(isCustomerSegment("x")).toBe(false);
  });
});
