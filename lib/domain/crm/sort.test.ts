import { describe, expect, it } from "vitest";
import { sortRows } from "@/lib/utils/sort";
import { CRM_SORT_ACCESSORS } from "./sort";
import type { CrmLead } from "./types";

const l = (over: Partial<CrmLead>): CrmLead => ({ id: "x", ...over });

describe("aday tablosu sıralaması", () => {
  it("müşteriyi başlığa göre Türkçe sıralar (kurum, yoksa kişi)", () => {
    const rows = [l({ id: "1", organizationName: "Zirve" }), l({ id: "2", contactFirstName: "Çınar" }), l({ id: "3", organizationName: "Ata" })];
    expect(sortRows(rows, { key: "customer", dir: "asc" }, CRM_SORT_ACCESSORS).map((r) => r.id)).toEqual(["3", "2", "1"]);
  });
  it("aşamaları satış akışı sırasıyla, statüsüzü sonda sıralar", () => {
    const rows = [l({ id: "a", status: "OLUMSUZ" }), l({ id: "b" }), l({ id: "c", status: "ARANACAK" })];
    expect(sortRows(rows, { key: "stage", dir: "asc" }, CRM_SORT_ACCESSORS).map((r) => r.id)).toEqual(["c", "a", "b"]);
    expect(sortRows(rows, { key: "stage", dir: "desc" }, CRM_SORT_ACCESSORS).map((r) => r.id)).toEqual(["a", "c", "b"]);
  });
  it("bakiyeye göre sıralar, sıfır bakiye sonda", () => {
    const rows = [l({ id: "a", saleAmount: 100, collectedAmount: 100 }), l({ id: "b", saleAmount: 500 }), l({ id: "c", saleAmount: 900, collectedAmount: 100 })];
    expect(sortRows(rows, { key: "balance", dir: "desc" }, CRM_SORT_ACCESSORS).map((r) => r.id)).toEqual(["c", "b", "a"]);
  });
});
