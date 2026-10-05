import { describe, expect, it } from "vitest";
import {
  EMPTY_FOLLOW_UP,
  addDaysIso,
  applyStatusChange,
  compareFollowUps,
  daysToIso,
  leadFollowUp,
  toIsoDate,
  type LeadFollowUp,
} from "./offer";
import type { CrmLead } from "./types";

const lead = (over: Partial<CrmLead> = {}): CrmLead => ({ id: "l1", ...over });
const NONE: LeadFollowUp = EMPTY_FOLLOW_UP;
const today = "2026-09-26";

describe("leadFollowUp (kolonlardan)", () => {
  it("teklif, sonraki arama ve kayıp nedeni alanlardan okunur", () => {
    const fu = leadFollowUp(lead({ status: "TEKLIF_VERILDI", offerSentAt: "2026-09-20", nextFollowUpAt: "2026-10-01", updatedAt: 5 }));
    expect(fu).toEqual({
      displayStatus: "TEKLIF_VERILDI",
      offerOpen: true,
      offerDate: "2026-09-20",
      nextDate: "2026-10-01",
      lostReason: null,
      markedAt: 5,
    });
    expect(leadFollowUp(lead({ status: "OLUMSUZ", lostReason: "PRICE" }))).toMatchObject({ offerOpen: false, lostReason: "PRICE" });
    expect(leadFollowUp(lead())).toEqual(NONE);
  });
});

describe("applyStatusChange", () => {
  it("teklife geçiş bugünün teklif tarihini yazar; sonraki arama kalır", () => {
    expect(applyStatusChange({ status: "TAKIPTE" }, { status: "TEKLIF_VERILDI", nextDate: "2026-09-29", lostReason: "PRICE" }, today)).toEqual({
      status: "TEKLIF_VERILDI",
      next_follow_up_at: "2026-09-29",
      lost_reason: null,
      offer_sent_at: today,
      sold_at: null,
    });
  });

  it("zaten teklifteyse teklif tarihine dokunmaz", () => {
    const cols = applyStatusChange({ status: "TEKLIF_VERILDI" }, { status: "TEKLIF_VERILDI", nextDate: null, lostReason: null }, today);
    expect("offer_sent_at" in cols).toBe(false);
  });

  it("kayıp nedeni yalnız Satış olmadı'da; takip dışı statüde sonraki arama silinir", () => {
    expect(applyStatusChange({ status: "TAKIPTE" }, { status: "OLUMSUZ", nextDate: "2026-12-25", lostReason: "BUDGET_NOT_APPROVED" }, today)).toMatchObject({
      next_follow_up_at: "2026-12-25",
      lost_reason: "BUDGET_NOT_APPROVED",
    });
    expect(applyStatusChange({ status: "OLUMSUZ" }, { status: "ARANACAK", nextDate: "2026-12-25", lostReason: "BUDGET_NOT_APPROVED" }, today)).toEqual({
      status: "ARANACAK",
      next_follow_up_at: null,
      lost_reason: null,
      sold_at: null,
    });
  });

  it("satışa geçiş satış tarihini yazar, satıştan çıkış siler, satışta kalmak korur", () => {
    expect(applyStatusChange({ status: "TEKLIF_VERILDI" }, { status: "SATIS_OLDU", nextDate: null, lostReason: null }, today).sold_at).toBe(today);
    expect("sold_at" in applyStatusChange({ status: "SATIS_OLDU" }, { status: "SATIS_OLDU", nextDate: null, lostReason: null }, today)).toBe(
      false
    );
    expect(applyStatusChange({ status: "SATIS_OLDU" }, { status: "TAKIPTE", nextDate: null, lostReason: null }, today).sold_at).toBeNull();
  });
});

describe("tarih yardımcıları", () => {
  it("gün ekler ve uzaklığı ölçer", () => {
    expect(addDaysIso("2026-09-29", 3)).toBe("2026-10-02");
    expect(addDaysIso("2026-03-01", -1)).toBe("2026-02-28");
    expect(toIsoDate(new Date(2026, 0, 5))).toBe("2026-01-05");
    const now = new Date(2026, 8, 26, 15);
    expect(daysToIso("2026-09-26", now)).toBe(0);
    expect(daysToIso("2026-09-20", now)).toBe(-6);
    expect(daysToIso(null, now)).toBeNull();
  });

  it("tarihli takipler önce sıralanır", () => {
    const a = { ...NONE, nextDate: "2026-10-02" };
    const b = { ...NONE, nextDate: "2026-09-01" };
    expect([a, NONE, b].sort(compareFollowUps).map((x) => x.nextDate)).toEqual(["2026-09-01", "2026-10-02", null]);
  });
});
