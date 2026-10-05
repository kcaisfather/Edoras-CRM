import { describe, expect, it } from "vitest";
import { planLeadPatch } from "./complete";

const TODAY = "2026-09-26";

describe("planLeadPatch", () => {
  it("yalnız sonuç girildiyse aday değişmez", () => {
    expect(planLeadPatch({ status: "TEKLIF_VERILDI", next_follow_up_at: null }, {}, TODAY)).toBeNull();
    // Aynı statü "değişiklik yok" sayılır.
    expect(planLeadPatch({ status: "TAKIPTE", next_follow_up_at: null }, { status: "TAKIPTE" }, TODAY)).toBeNull();
    // Aynı arama tarihi yeniden yazılmaz.
    expect(planLeadPatch({ status: "TAKIPTE", next_follow_up_at: "2026-10-01" }, { nextFollowUpAt: "2026-10-01" }, TODAY)).toBeNull();
  });

  it("statü değişikliği teklifi kapatır, kayıp nedenini ve sonraki aramayı yazar", () => {
    const p = planLeadPatch(
      { status: "TEKLIF_VERILDI", next_follow_up_at: null },
      { status: "OLUMSUZ", nextFollowUpAt: "2026-12-25", lostReason: "PRICE" },
      TODAY
    );
    expect(p).toEqual({ status: "OLUMSUZ", next_follow_up_at: "2026-12-25", lost_reason: "PRICE", sold_at: null });
  });

  it("statü değişmeden sonraki arama tarihi her statüde yazılır", () => {
    expect(planLeadPatch({ status: "SATIS_OLDU", next_follow_up_at: null }, { nextFollowUpAt: "2026-10-01" }, TODAY)).toEqual({
      next_follow_up_at: "2026-10-01",
    });
    // Takip statüsü olmayan yeni statüde de tarih kaybolmaz (DeepSport: "Girilirse bu tarihte yeni bir görev oluşur").
    expect(
      planLeadPatch({ status: "ARANACAK", next_follow_up_at: null }, { status: "RANDEVU_PLANLANDI", nextFollowUpAt: "2026-10-03" }, TODAY)
    ).toEqual({ status: "RANDEVU_PLANLANDI", next_follow_up_at: "2026-10-03", lost_reason: null, sold_at: null });
  });

  it("teklife ve satışa geçişte tarih bugün olur; tarihsiz takip statüsü eski tarihi temizler", () => {
    expect(planLeadPatch({ status: "ARANACAK", next_follow_up_at: null }, { status: "TEKLIF_VERILDI" }, TODAY)).toMatchObject({
      status: "TEKLIF_VERILDI",
      offer_sent_at: TODAY,
    });
    expect(planLeadPatch({ status: "TEKLIF_VERILDI", next_follow_up_at: null }, { status: "SATIS_OLDU" }, TODAY)).toMatchObject({
      status: "SATIS_OLDU",
      sold_at: TODAY,
      next_follow_up_at: null,
    });
    expect(planLeadPatch({ status: "OLUMSUZ", next_follow_up_at: "2026-12-01" }, { status: "TAKIPTE" }, TODAY)).toMatchObject({
      status: "TAKIPTE",
      next_follow_up_at: null,
      lost_reason: null,
    });
  });

  it('"Satış olmadı"dan çıkış kayıp ayrıntısını da temizler; kalırken dokunmaz', () => {
    expect(planLeadPatch({ status: "OLUMSUZ", next_follow_up_at: null }, { status: "TAKIPTE" }, TODAY)).toMatchObject({
      status: "TAKIPTE",
      lost_reason: null,
      lost_note: null,
      competitor: null,
      recall_at: null,
    });
    expect(planLeadPatch({ status: "TAKIPTE", next_follow_up_at: null }, { status: "ARANACAK" }, TODAY)).not.toHaveProperty("lost_note");
  });
});
