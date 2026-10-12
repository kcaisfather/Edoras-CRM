import { describe, expect, it } from "vitest";
import {
  LEADS_TO_COLD_LIST_MAX,
  countSkipReasons,
  emptyLeadsToColdListResult,
  mergeLeadsToColdListResults,
  returnLeadsInTurn,
} from "./bulk-return";
import { leadsToColdListSchema } from "./schemas";

const listId = "6f1d1c8e-7c9b-4c2a-9f3e-2b1a0c9d8e7f";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

class CodedError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
const codeOf = (e: unknown) => (e instanceof CodedError ? e.code : "INTERNAL");

describe("toplu soğuk listeye taşı şeması", () => {
  it("aday kimlikleri + liste + kayıp nedeni", () => {
    const body = { leadIds: [id(1), id(2)], listId, lostReason: "OTHER" };
    expect(leadsToColdListSchema.parse(body)).toEqual(body);
  });

  it("boş seçim, sınırı aşan seçim, geçersiz kimlik, eksik liste / neden reddedilir", () => {
    const ok = { leadIds: [id(1)], listId, lostReason: "PRICE" };
    expect(leadsToColdListSchema.safeParse({ ...ok, leadIds: [] }).success).toBe(false);
    const tooMany = Array.from({ length: LEADS_TO_COLD_LIST_MAX + 1 }, (_, i) => id(i + 1));
    expect(leadsToColdListSchema.safeParse({ ...ok, leadIds: tooMany }).success).toBe(false);
    expect(leadsToColdListSchema.safeParse({ ...ok, leadIds: tooMany.slice(0, LEADS_TO_COLD_LIST_MAX) }).success).toBe(true);
    expect(leadsToColdListSchema.safeParse({ ...ok, leadIds: ["aday"] }).success).toBe(false);
    expect(leadsToColdListSchema.safeParse({ leadIds: ok.leadIds, lostReason: "PRICE" }).success).toBe(false);
    expect(leadsToColdListSchema.safeParse({ leadIds: ok.leadIds, listId }).success).toBe(false);
    expect(leadsToColdListSchema.safeParse({ ...ok, lostReason: "FIYAT" }).success).toBe(false);
  });
});

describe("toplu soğuk listeye taşı döngüsü", () => {
  it("sırayla işler, hata vereni atlar, kalanlar sürer; geri açılanları sayar", async () => {
    const seen: string[] = [];
    const result = await returnLeadsInTurn(
      [id(1), id(2), id(3), id(4)],
      async (leadId) => {
        seen.push(leadId);
        if (leadId === id(2)) throw new CodedError("LEAD_IS_CUSTOMER");
        if (leadId === id(3)) throw new CodedError("PROSPECT_DUPLICATE");
        return { restored: leadId === id(4) };
      },
      codeOf
    );
    expect(seen).toEqual([id(1), id(2), id(3), id(4)]);
    expect(result).toEqual({
      moved: 2,
      restored: 1,
      skipped: [
        { id: id(2), code: "LEAD_IS_CUSTOMER" },
        { id: id(3), code: "PROSPECT_DUPLICATE" },
      ],
    });
  });

  it("aynı aday bir kez işlenir; bilinmeyen hata INTERNAL", async () => {
    let calls = 0;
    const result = await returnLeadsInTurn(
      [id(1), id(1), id(2)],
      async (leadId) => {
        calls += 1;
        if (leadId === id(2)) throw new Error("bağlantı");
        return { restored: false };
      },
      codeOf
    );
    expect(calls).toBe(2);
    expect(result).toEqual({ moved: 1, restored: 0, skipped: [{ id: id(2), code: "INTERNAL" }] });
  });

  it("parça sonuçları toplanır", () => {
    const a = { moved: 2, restored: 1, skipped: [{ id: id(1), code: "NOT_FOUND" }] };
    const b = { moved: 3, restored: 0, skipped: [{ id: id(2), code: "LEAD_IS_CUSTOMER" }] };
    expect(mergeLeadsToColdListResults(emptyLeadsToColdListResult(), a)).toEqual(a);
    expect(mergeLeadsToColdListResults(a, b)).toEqual({ moved: 5, restored: 1, skipped: [...a.skipped, ...b.skipped] });
  });

  it("atlananlar nedene göre sabit sırayla sayılır; bilinmeyen kod Diğer", () => {
    expect(
      countSkipReasons([
        { id: id(1), code: "PROSPECT_DUPLICATE" },
        { id: id(2), code: "INTERNAL" },
        { id: id(3), code: "LEAD_IS_CUSTOMER" },
        { id: id(4), code: "LEAD_IS_CUSTOMER" },
        { id: id(5), code: "FORBIDDEN" },
      ])
    ).toEqual([
      { reason: "LEAD_IS_CUSTOMER", count: 2 },
      { reason: "PROSPECT_DUPLICATE", count: 1 },
      { reason: "OTHER", count: 2 },
    ]);
    expect(countSkipReasons([])).toEqual([]);
  });
});
