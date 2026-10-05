import { describe, expect, it } from "vitest";
import { DEFAULT_RULES } from "@/lib/domain/tasks/rules";
import {
  applyFieldsToLead,
  buildStatusChange,
  buildUndoPatch,
  optimisticLeadFields,
  patchLeadInCache,
  statusNeedsContext,
  suggestedNextDate,
} from "./status-change";
import type { CrmLead } from "./types";

const TODAY = "2026-10-05";
const lead = (over: Partial<CrmLead> = {}): CrmLead => ({
  id: "L1",
  organizationName: "Okul",
  contactFirstName: "Ayşe",
  status: "ARANACAK",
  offerAmount: 5000,
  saleAmount: null,
  collectedAmount: 0,
  nextFollowUpAt: null,
  lostReason: null,
  ...over,
});

const build = (l: CrmLead, target: Parameters<typeof buildStatusChange>[0]["target"], input = {}, canSeeFinancials = true) =>
  buildStatusChange({ lead: l, target, input, canSeeFinancials });

function addDays(d: Date, n: number): string {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

describe("statusNeedsContext", () => {
  it("asks for context only for offer, lost and sold", () => {
    expect(statusNeedsContext("TEKLIF_VERILDI")).toBe(true);
    expect(statusNeedsContext("OLUMSUZ")).toBe(true);
    expect(statusNeedsContext("SATIS_OLDU")).toBe(true);
    for (const s of ["ARANACAK", "ULASILAMADI", "RANDEVU_PLANLANDI", "DEMO_TANIMLANDI", "TAKIPTE"] as const) {
      expect(statusNeedsContext(s)).toBe(false);
    }
  });
});

describe("suggestedNextDate", () => {
  const today = new Date(2026, 9, 5);
  it("keeps the existing date", () => {
    expect(suggestedNextDate("TEKLIF_VERILDI", "2026-10-10", DEFAULT_RULES, today)).toBe("2026-10-10");
  });
  it("uses the follow-up rules (offer +gün, lostRecontact +gün) and nothing for other statuses", () => {
    const offer = DEFAULT_RULES.find((r) => r.id === "offer")!;
    const lost = DEFAULT_RULES.find((r) => r.id === "lostRecontact")!;
    expect(suggestedNextDate("TEKLIF_VERILDI", null, DEFAULT_RULES, today)).toBe(offer.enabled ? addDays(today, offer.days) : "");
    expect(suggestedNextDate("OLUMSUZ", null, DEFAULT_RULES, today)).toBe(lost.enabled ? addDays(today, lost.days) : "");
    expect(suggestedNextDate("ARANACAK", null, DEFAULT_RULES, today)).toBe("");
    const off = DEFAULT_RULES.map((r) => ({ ...r, enabled: false }));
    expect(suggestedNextDate("OLUMSUZ", null, off, today)).toBe("");
  });
});

describe("buildStatusChange", () => {
  it("simple status: partial body with the status only", () => {
    expect(build(lead(), "ULASILAMADI")).toEqual({ ok: true, patch: { status: "ULASILAMADI" } });
  });

  it("offer: amount (TR yazım) and next call", () => {
    const res = build(lead(), "TEKLIF_VERILDI", { offerAmount: "7.500", nextCall: "2026-10-12" });
    expect(res).toEqual({ ok: true, patch: { status: "TEKLIF_VERILDI", offerAmount: 7500, nextFollowUpAt: "2026-10-12" } });
  });

  it("offer / sale with an empty amount → 0 TL (same as the edit form)", () => {
    const offer = build(lead({ offerAmount: null }), "TEKLIF_VERILDI", { offerAmount: "" });
    expect(offer.ok && offer.patch.offerAmount).toBe(0);
    const sale = build(lead(), "SATIS_OLDU", { saleAmount: "" });
    expect(sale.ok && sale.patch.saleAmount).toBe(0);
  });

  it("unreadable amount is rejected", () => {
    expect(build(lead(), "SATIS_OLDU", { saleAmount: "abc" })).toEqual({ ok: false, error: "amountInvalid" });
  });

  it("CRM_AGENT never sends amounts", () => {
    const offer = build(lead(), "TEKLIF_VERILDI", { offerAmount: "999" }, false);
    expect(offer).toEqual({ ok: true, patch: { status: "TEKLIF_VERILDI" } });
    const sale = build(lead(), "SATIS_OLDU", { saleAmount: "999" }, false);
    expect(sale).toEqual({ ok: true, patch: { status: "SATIS_OLDU" } });
  });

  it("lost requires a reason; loss detail is never sent (the server keeps / clears it)", () => {
    expect(build(lead(), "OLUMSUZ", { lostReason: "" })).toEqual({ ok: false, error: "lostReasonRequired" });
    expect(build(lead(), "OLUMSUZ", { lostReason: "FIYAT" })).toEqual({ ok: false, error: "lostReasonRequired" });
    const res = build(lead(), "OLUMSUZ", { lostReason: "PRICE", nextCall: "2027-01-05" });
    expect(res).toEqual({ ok: true, patch: { status: "OLUMSUZ", lostReason: "PRICE", nextFollowUpAt: "2027-01-05" } });
    if (res.ok) {
      expect(res.patch).not.toHaveProperty("lostNote");
      expect(res.patch).not.toHaveProperty("competitor");
      expect(res.patch).not.toHaveProperty("recallAt");
    }
  });

  it("the next call is sent only for follow-up statuses and only when entered", () => {
    expect(build(lead(), "ARANACAK", { nextCall: "2026-10-12" })).toEqual({ ok: true, patch: { status: "ARANACAK" } });
    expect(build(lead(), "TAKIPTE", { nextCall: "" })).toEqual({ ok: true, patch: { status: "TAKIPTE" } });
    expect(build(lead(), "TAKIPTE", { nextCall: "2026-10-12" })).toEqual({ ok: true, patch: { status: "TAKIPTE", nextFollowUpAt: "2026-10-12" } });
  });
});

describe("buildUndoPatch", () => {
  it("restores the previous status; follow-up statuses get their date back (or an explicit null)", () => {
    const prev = lead({ status: "TEKLIF_VERILDI", nextFollowUpAt: "2026-10-08", offerAmount: 5000 });
    expect(buildUndoPatch(prev, { status: "ARANACAK" }, true)).toEqual({ status: "TEKLIF_VERILDI", nextFollowUpAt: "2026-10-08" });
    expect(buildUndoPatch(lead({ status: "TAKIPTE" }), { status: "ARANACAK" }, true)).toEqual({ status: "TAKIPTE", nextFollowUpAt: null });
    expect(buildUndoPatch(lead({ status: "ULASILAMADI" }), { status: "ARANACAK" }, true)).toEqual({ status: "ULASILAMADI" });
  });

  it("restores the loss reason and detail when leaving 'Satış olmadı'", () => {
    const prev = lead({
      status: "OLUMSUZ",
      lostReason: "COMPETITOR",
      lostNote: "Fiyat",
      competitor: "X",
      recallAt: "2027-01-01",
      nextFollowUpAt: "2027-01-02",
    });
    expect(buildUndoPatch(prev, { status: "ARANACAK" }, true)).toEqual({
      status: "OLUMSUZ",
      nextFollowUpAt: "2027-01-02",
      lostReason: "COMPETITOR",
      lostNote: "Fiyat",
      competitor: "X",
      recallAt: "2027-01-01",
    });
  });

  it("restores amounts only when the forward write changed them and only with financial access", () => {
    const prev = lead({ offerAmount: null, saleAmount: 100 });
    expect(buildUndoPatch(prev, { status: "TEKLIF_VERILDI", offerAmount: 0 }, true)).toEqual({ status: "ARANACAK", offerAmount: null });
    expect(buildUndoPatch(prev, { status: "SATIS_OLDU", saleAmount: 50 }, true)).toEqual({ status: "ARANACAK", saleAmount: 100 });
    expect(buildUndoPatch(prev, { status: "SATIS_OLDU", saleAmount: 50 }, false)).toEqual({ status: "ARANACAK" });
  });

  it("no previous status → no undo", () => {
    expect(buildUndoPatch({ id: "L1" }, { status: "ARANACAK" }, true)).toBeNull();
  });
});

describe("optimisticLeadFields", () => {
  it("offer: date, offer date and amount", () => {
    const fields = optimisticLeadFields(lead(), { status: "TEKLIF_VERILDI", nextFollowUpAt: "2026-10-08", offerAmount: 7500 }, TODAY);
    expect(fields).toMatchObject({
      status: "TEKLIF_VERILDI",
      nextFollowUpAt: "2026-10-08",
      offerSentAt: TODAY,
      offerAmount: 7500,
      lostReason: null,
      soldAt: null,
    });
  });

  it("sold gets today's date; leaving 'Satış oldu' clears it", () => {
    expect(optimisticLeadFields(lead(), { status: "SATIS_OLDU", saleAmount: 100 }, TODAY)).toMatchObject({ soldAt: TODAY, saleAmount: 100, nextFollowUpAt: null });
    expect(optimisticLeadFields(lead({ status: "SATIS_OLDU", soldAt: "2026-09-01" }), { status: "TAKIPTE" }, TODAY).soldAt).toBeNull();
  });

  it("leaving 'Satış olmadı' clears reason and detail; staying keeps the detail and drops the competitor on a reason change", () => {
    const lost = lead({ status: "OLUMSUZ", lostReason: "COMPETITOR", lostNote: "n", competitor: "X", recallAt: "2027-01-01" });
    expect(optimisticLeadFields(lost, { status: "ARANACAK" }, TODAY)).toMatchObject({
      lostReason: null,
      lostNote: null,
      competitor: null,
      recallAt: null,
    });
    const changed = optimisticLeadFields(lost, { status: "OLUMSUZ", lostReason: "PRICE" }, TODAY);
    expect(changed).toMatchObject({ lostReason: "PRICE", competitor: null });
    expect(changed).not.toHaveProperty("lostNote");
  });
});

describe("applyFieldsToLead / patchLeadInCache", () => {
  it("returns the same object when nothing changes", () => {
    const l = lead();
    expect(applyFieldsToLead(l, { status: "ARANACAK" })).toBe(l);
    expect(applyFieldsToLead(l, { status: "TAKIPTE" })).toEqual({ ...l, status: "TAKIPTE" });
  });

  it("patches a list, a single record and ignores other shapes", () => {
    const a = lead({ id: "A" });
    const b = lead({ id: "B" });
    const update = (x: { id: string }) => applyFieldsToLead(x as CrmLead, { status: "TAKIPTE" });
    const list = patchLeadInCache([a, b], "B", update);
    expect(list[0]).toBe(a);
    expect((list[1] as CrmLead).status).toBe("TAKIPTE");
    expect((patchLeadInCache(a, "A", update) as CrmLead).status).toBe("TAKIPTE");
    expect(patchLeadInCache(a, "Z", update)).toBe(a);
    const other = { rules: [] };
    expect(patchLeadInCache(other, "A", update)).toBe(other);
    expect(patchLeadInCache(null, "A", update)).toBeNull();
  });
});
