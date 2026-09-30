import { describe, expect, it } from "vitest";
import { sortRows } from "@/lib/utils/sort";
import { CUSTOMER_SORT_KEYS, customerSortAccessors, guardFinancialSort, renewalSortAccessors, topSortAccessors } from "./sort";
import { renewalRows } from "./renewals";
import { topInstitutions } from "./top";
import { customer, license, usage } from "./test-fixtures";

const NOW = new Date("2026-09-30T09:00:00Z");
const acc = customerSortAccessors({ now: NOW });
const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

describe("müşteri tablosu sıralaması", () => {
  it("adı Türkçe sıralar", () => {
    const rows = [customer({ id: "1", name: "Zirve" }), customer({ id: "2", name: "Çınar" }), customer({ id: "3", name: "Ata" })];
    expect(ids(sortRows(rows, { key: "customer", dir: "asc" }, acc))).toEqual(["3", "2", "1"]);
  });

  it("son etkinlik: hiç etkinliği olmayan yönden bağımsız sonda", () => {
    const rows = [
      customer({ id: "old", usage: usage({ lastDates: { attendance: "2026-01-01" } }) }),
      customer({ id: "none" }),
      customer({ id: "new", usage: usage({ lastDates: { attendance: "2026-09-28" } }) }),
      customer({ id: "unknown", usage: null }),
    ];
    expect(ids(sortRows(rows, { key: "lastActivity", dir: "desc" }, acc)).slice(0, 2)).toEqual(["new", "old"]);
    expect(ids(sortRows(rows, { key: "lastActivity", dir: "asc" }, acc)).slice(0, 2)).toEqual(["old", "new"]);
  });

  it("kullanım: artan sırada kullanmayanlar önce", () => {
    const rows = [
      customer({ id: "on", usage: usage({ lastDates: { exams: "2026-09-29" } }) }),
      customer({ id: "off", usage: usage({ lastDates: { exams: "2026-05-01" } }) }),
    ];
    expect(ids(sortRows(rows, { key: "usage", dir: "asc" }, acc))).toEqual(["off", "on"]);
  });

  it("bakiye: sıfır bakiye sonda", () => {
    const owes = customer({ id: "owes", licenses: [license({ startsOn: "2026-03-01", endsOn: "2027-03-01", price: 9000 })], payments: [] });
    const clear = customer({ id: "clear", licenses: [license({ startsOn: "2026-03-01", endsOn: "2027-03-01", price: 9000 })], payments: [{ amount: 9000, paidOn: "2026-03-02" }] });
    expect(ids(sortRows([clear, owes], { key: "balance", dir: "desc" }, acc))).toEqual(["owes", "clear"]);
  });

  it("finansal sütun sıralaması yetkisiz rolde yok sayılır", () => {
    expect(guardFinancialSort({ key: "balance", dir: "asc" }, false)).toBeNull();
    expect(guardFinancialSort({ key: "balance", dir: "asc" }, true)).toEqual({ key: "balance", dir: "asc" });
    expect(guardFinancialSort({ key: "customer", dir: "asc" }, false)).toEqual({ key: "customer", dir: "asc" });
    expect(CUSTOMER_SORT_KEYS).toContain("balance");
  });

  it("yenileme ve en aktif kurum erişimcileri", () => {
    const a = customer({ id: "a", name: "A", licenseEndsOn: "2026-10-20" });
    const b = customer({ id: "b", name: "B", licenseEndsOn: "2026-10-05" });
    const rows = renewalRows([a, b], NOW);
    expect(rows.map((r) => r.customer.id)).toEqual(["b", "a"]);
    const byDays = sortRows(rows, { key: "daysLeft", dir: "desc" }, renewalSortAccessors(NOW));
    expect(byDays.map((r) => r.customer.id)).toEqual(["a", "b"]);
    const top = topInstitutions([customer({ id: "x", usage: usage({ counts: { sms: 1 } }) }), customer({ id: "y", usage: usage({ counts: { sms: 7 } }) })]);
    expect(sortRows(top, { key: "activity", dir: "asc" }, topSortAccessors()).map((r) => r.customer.id)).toEqual(["x", "y"]);
  });
});
