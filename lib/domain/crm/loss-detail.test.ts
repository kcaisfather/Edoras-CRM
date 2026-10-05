import { describe, expect, it } from "vitest";
import { LOSS_DETAIL_CLEARED, planLossDetail, type LossDetailColumns } from "./loss-detail";
import { LOST_REASONS } from "./types";
import { leadCreateSchema, leadPatchSchema } from "./schemas";

const EMPTY: LossDetailColumns = { lost_note: null, competitor: null, recall_at: null };
const FULL: LossDetailColumns = { lost_note: "Fiyatı yüksek buldu", competitor: "Rakip A.Ş.", recall_at: "2027-01-10" };

describe("12'li kayıp nedeni kümesi", () => {
  it("DeepSport ortak kümesiyle aynı 12 değer; eski değerler yok", () => {
    expect(LOST_REASONS).toHaveLength(12);
    expect(LOST_REASONS).toContain("COMPETITOR");
    expect(LOST_REASONS).not.toContain("FIYAT" as never);
    expect(leadPatchSchema.safeParse({ lostReason: "FIYAT" }).success).toBe(false);
    expect(leadPatchSchema.safeParse({ lostReason: "TEAM_DISBANDED" }).success).toBe(true);
  });
});

describe("planLossDetail", () => {
  it("OLUMSUZ'da yalnız değişen alanlar döner; boş metin temizler", () => {
    expect(planLossDetail(EMPTY, { lostNote: "Not", recallAt: "2027-02-01" }, "OLUMSUZ", "PRICE")).toEqual({
      lost_note: "Not",
      recall_at: "2027-02-01",
    });
    expect(planLossDetail(FULL, {}, "OLUMSUZ", "COMPETITOR")).toEqual({});
    expect(planLossDetail(FULL, { lostNote: null }, "OLUMSUZ", "COMPETITOR")).toEqual({ lost_note: null });
  });

  it("rakip adı yalnız neden COMPETITOR iken kalır", () => {
    expect(planLossDetail(EMPTY, { competitor: "X" }, "OLUMSUZ", "PRICE")).toEqual({});
    expect(planLossDetail(EMPTY, { competitor: "X" }, "OLUMSUZ", "COMPETITOR")).toEqual({ competitor: "X" });
    // Neden başka bir şeye çevrilince eski rakip adı silinir.
    expect(planLossDetail(FULL, {}, "OLUMSUZ", "PRICE")).toEqual({ competitor: null });
  });

  it('"Satış olmadı"dan çıkınca üçü de temizlenir; gövdedeki değer yok sayılır', () => {
    expect(planLossDetail(FULL, {}, "TAKIPTE", null)).toEqual(LOSS_DETAIL_CLEARED);
    expect(planLossDetail(EMPTY, { lostNote: "x", competitor: "y", recallAt: "2027-01-01" }, "ARANACAK", null)).toEqual({});
  });
});

describe("şemalar", () => {
  it("oluşturmada ayrıntı varsayılan null; boş metin null olur; uzunluk ve tarih denetlenir", () => {
    const r = leadCreateSchema.parse({ organizationName: "A" });
    expect(r).toMatchObject({ lostNote: null, competitor: null, recallAt: null });
    expect(leadPatchSchema.parse({ lostNote: "  ", competitor: "" })).toMatchObject({ lostNote: null, competitor: null });
    expect(leadPatchSchema.safeParse({ competitor: "x".repeat(129) }).success).toBe(false);
    expect(leadPatchSchema.safeParse({ lostNote: "x".repeat(2001) }).success).toBe(false);
    expect(leadPatchSchema.safeParse({ recallAt: "10.01.2027" }).success).toBe(false);
    expect(leadPatchSchema.safeParse({ recallAt: "2027-01-10" }).success).toBe(true);
  });
});
