import { describe, expect, it } from "vitest";
import { HOT_MIN, WARM_MIN, freshnessPoints, leadScore, tierOf } from "./score";
import type { CrmLead } from "./types";

const NOW = new Date("2026-10-05T09:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const lead = (over: Partial<CrmLead> = {}): CrmLead => ({
  id: "l",
  status: "ARANACAK",
  source: "MANUAL",
  updatedAt: NOW.getTime(),
  ...over,
});
const part = (s: ReturnType<typeof leadScore>, key: string) => s?.parts.find((p) => p.key === key)?.points;

describe("leadScore", () => {
  it("satışı yapılmış, olumsuz ve statüsüz aday puanlanmaz", () => {
    expect(leadScore(lead({ status: "SATIS_OLDU" }), NOW)).toBeNull();
    expect(leadScore(lead({ status: "OLUMSUZ" }), NOW)).toBeNull();
    expect(leadScore(lead({ status: undefined }), NOW)).toBeNull();
  });

  it("aşama puanı satış akışıyla artar", () => {
    const stage = (status: CrmLead["status"]) => part(leadScore(lead({ status }), NOW), "stage");
    expect(stage("ARANACAK")).toBe(10);
    expect(stage("TAKIPTE")).toBe(20);
    expect(stage("RANDEVU_PLANLANDI")).toBe(30);
    expect(stage("TEKLIF_VERILDI")).toBe(40);
  });

  it("en iyi durum: teklif verilmiş, taze, takipli, iletişimi tam, Edoras kaynaklı, kuruma bağlı = 100", () => {
    const s = leadScore(
      lead({
        status: "TEKLIF_VERILDI",
        nextFollowUpAt: "2026-10-10",
        contactEmail: "a@b.com",
        contactPhone: "+905551112233",
        source: "EDORAS",
        institutionId: "inst",
      }),
      NOW
    );
    expect(s?.score).toBe(100);
    expect(s?.tier).toBe("hot");
  });

  it("boş soğuk liste adayı düşük puanlı ve soğuk", () => {
    const s = leadScore(lead({ source: "COLD_LIST", updatedAt: NOW.getTime() - 60 * DAY }), NOW);
    expect(s?.score).toBe(10 + 1 + 0 + 0 + 3 + 0);
    expect(s?.tier).toBe("cold");
  });

  it("takip puanı yalnız gelecekteki / bugünkü takipte; gecikmiş takip 0 ve işaretlenir", () => {
    expect(part(leadScore(lead({ nextFollowUpAt: "2026-10-05" }), NOW), "followUp")).toBe(10);
    const late = leadScore(lead({ nextFollowUpAt: "2026-10-01" }), NOW);
    expect(part(late, "followUp")).toBe(0);
    expect(late?.followUpOverdue).toBe(true);
    expect(leadScore(lead(), NOW)?.followUpOverdue).toBe(false);
  });

  it("iletişim: e-posta 7, telefon 8", () => {
    expect(part(leadScore(lead({ contactEmail: "a@b.com" }), NOW), "contact")).toBe(7);
    expect(part(leadScore(lead({ contactPhone: "+905551112233" }), NOW), "contact")).toBe(8);
    expect(part(leadScore(lead({ contactEmail: "a@b.com", contactPhone: "+905551112233" }), NOW), "contact")).toBe(15);
  });

  it("çözülmemiş şikâyet 10 puan düşürür; çözülmüş düşürmez; skor 0'ın altına inmez", () => {
    const d = (status: "acik" | "cozuldu") => ({ category: "x", severity: "y", status, description: "", createdAt: null }) as unknown as CrmLead["dissatisfaction"];
    const base = leadScore(lead({ status: "TAKIPTE" }), NOW)!.score;
    expect(leadScore(lead({ status: "TAKIPTE", dissatisfaction: d("acik") }), NOW)!.score).toBe(base - 10);
    expect(leadScore(lead({ status: "TAKIPTE", dissatisfaction: d("cozuldu") }), NOW)!.score).toBe(base);
    expect(leadScore(lead({ status: "ULASILAMADI", source: "COLD_LIST", updatedAt: 0, dissatisfaction: d("acik") }), NOW)!.score).toBeGreaterThanOrEqual(0);
  });
});

describe("freshnessPoints ve tierOf", () => {
  it("tazelik eşikleri", () => {
    expect([0, 3, 4, 7, 8, 14, 15, 30, 31].map(freshnessPoints)).toEqual([20, 20, 16, 16, 11, 11, 6, 6, 1]);
    expect(freshnessPoints(null)).toBe(1);
  });
  it("kademe eşikleri", () => {
    expect(tierOf(HOT_MIN)).toBe("hot");
    expect(tierOf(HOT_MIN - 1)).toBe("warm");
    expect(tierOf(WARM_MIN)).toBe("warm");
    expect(tierOf(WARM_MIN - 1)).toBe("cold");
  });
});
