import { describe, expect, it } from "vitest";
import { topInstitutions } from "./top";
import { customer, usage } from "./test-fixtures";

const c = (id: string, counts: Parameters<typeof usage>[0] = {}, over: object = {}) => customer({ id, name: id.toUpperCase(), usage: usage(counts), ...over });

describe("en aktif kurumlar (Sadık Top 50)", () => {
  it("toplam etkinliğe göre azalan sıralar, sıra numarası 1'den", () => {
    const rows = topInstitutions([c("a", { counts: { attendance: 5 } }), c("b", { counts: { attendance: 50 } }), c("c", { counts: { exams: 20 } })]);
    expect(rows.map((r) => [r.rank, r.customer.id, r.activity])).toEqual([
      [1, "b", 50],
      [2, "c", 20],
      [3, "a", 5],
    ]);
  });

  it("eşitlikte farklı özellik sayısı, sonra son etkinlik, sonra ad", () => {
    const rows = topInstitutions([
      c("a", { counts: { attendance: 10 }, lastDates: { attendance: "2026-09-01" } }),
      c("b", { counts: { attendance: 5, exams: 5 } }),
      c("c", { counts: { attendance: 10 }, lastDates: { attendance: "2026-09-20" } }),
    ]);
    expect(rows.map((r) => r.customer.id)).toEqual(["b", "c", "a"]);
  });

  it("etkinliği olmayan, kullanımı bilinmeyen ve dışlanan kurum girmez; limit uygulanır", () => {
    const list = [c("a", { counts: { sms: 1 } }), c("b"), customer({ id: "n", usage: null }), c("x", { counts: { sms: 9 } }), c("y", { counts: { sms: 3 } })];
    expect(topInstitutions(list, { exclude: (k) => k.id === "x" }).map((r) => r.customer.id)).toEqual(["y", "a"]);
    expect(topInstitutions(list, { limit: 1 })).toHaveLength(1);
    expect(topInstitutions(list, { limit: 0 })).toEqual([]);
  });
});
