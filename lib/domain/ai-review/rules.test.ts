import { describe, expect, it } from "vitest";
import { aiReviewBatchSchema, autoAction, autoRejectNote, deckAutoEligible, parseAiFilter, readAutoDecisionFlags } from "./rules";

const ON = { autoApprove: true, autoReject: true, minConfidence: 0.9 };
const OFF = { autoApprove: false, autoReject: false, minConfidence: 0.9 };

describe("readAutoDecisionFlags", () => {
  it("varsayılan: hepsi kapalı, eşik 0.9", () => {
    expect(readAutoDecisionFlags({})).toEqual(OFF);
  });
  it("yalnız '1' açar", () => {
    expect(readAutoDecisionFlags({ AI_REVIEW_AUTO_REJECT: "1", AI_REVIEW_AUTO_APPROVE: "true" })).toMatchObject({
      autoReject: true,
      autoApprove: false,
    });
  });
  it("geçersiz eşik varsayılana döner", () => {
    expect(readAutoDecisionFlags({ AI_REVIEW_MIN_CONFIDENCE: "5" }).minConfidence).toBe(0.9);
    expect(readAutoDecisionFlags({ AI_REVIEW_MIN_CONFIDENCE: "abc" }).minConfidence).toBe(0.9);
    expect(readAutoDecisionFlags({ AI_REVIEW_MIN_CONFIDENCE: "0.8" }).minConfidence).toBe(0.8);
  });
});

describe("autoAction", () => {
  it("bayraklar kapalıyken hiçbir şey yapmaz", () => {
    expect(autoAction({ verdict: "RED", confidence: 1 }, OFF)).toBe("none");
    expect(autoAction({ verdict: "ONAY", confidence: 1 }, OFF)).toBe("none");
  });
  it("RED ve ONAY eşiğin altında insanda kalır", () => {
    expect(autoAction({ verdict: "RED", confidence: 0.89 }, ON)).toBe("none");
    expect(autoAction({ verdict: "ONAY", confidence: 0.5 }, ON)).toBe("none");
  });
  it("eşikte ve üstünde karar verir", () => {
    expect(autoAction({ verdict: "RED", confidence: 0.9 }, ON)).toBe("reject");
    expect(autoAction({ verdict: "ONAY", confidence: 0.95 }, ON)).toBe("approve");
  });
  it("BELİRSİZ asla otomatik karar almaz", () => {
    expect(autoAction({ verdict: "BELIRSIZ", confidence: 1 }, ON)).toBe("none");
  });
  it("bayraklar bağımsız: yalnız red açıkken onay verilmez", () => {
    expect(autoAction({ verdict: "ONAY", confidence: 1 }, { ...ON, autoApprove: false })).toBe("none");
    expect(autoAction({ verdict: "RED", confidence: 1 }, { ...ON, autoReject: false })).toBe("none");
  });
});

describe("aiReviewBatchSchema / autoRejectNote", () => {
  it("geçerli partiyi kabul eder, boş gerekçeyi null yapar", () => {
    const parsed = aiReviewBatchSchema.parse({
      model: "claude-haiku-5-5",
      results: [{ id: "6f1c2d9e-3b4a-4c5d-8e7f-1a2b3c4d5e6f", verdict: "RED", confidence: 0.95, reason: "" }],
    });
    expect(parsed.results[0].reason).toBeNull();
  });
  it("bilinmeyen karar ve aralık dışı güveni reddeder", () => {
    const id = "6f1c2d9e-3b4a-4c5d-8e7f-1a2b3c4d5e6f";
    expect(aiReviewBatchSchema.safeParse({ model: "m", results: [{ id, verdict: "OK", confidence: 0.5 }] }).success).toBe(false);
    expect(aiReviewBatchSchema.safeParse({ model: "m", results: [{ id, verdict: "RED", confidence: 1.5 }] }).success).toBe(false);
  });
  it("red notu 500 karakteri aşmaz", () => {
    expect(autoRejectNote("x".repeat(900)).length).toBe(500);
    expect(autoRejectNote(null)).toContain("gerekçe yok");
  });
});

describe("deckAutoEligible", () => {
  it("formül ağırlıklı derslerde otomatik karar yok", () => {
    expect(deckAutoEligible("Matematik")).toBe(false);
    expect(deckAutoEligible("10. Sınıf Fizik")).toBe(false);
    expect(deckAutoEligible("Kimya")).toBe(false);
  });
  it("sözel derslerde var", () => {
    expect(deckAutoEligible("Biyoloji")).toBe(true);
    expect(deckAutoEligible("Tarih")).toBe(true);
    expect(deckAutoEligible("Coğrafya")).toBe(true);
  });
});

describe("parseAiFilter", () => {
  it("geçerli karar ve NONE'u kabul eder", () => {
    expect(parseAiFilter("RED")).toBe("RED");
    expect(parseAiFilter("BELIRSIZ")).toBe("BELIRSIZ");
    expect(parseAiFilter("ONAY")).toBe("ONAY");
    expect(parseAiFilter("NONE")).toBe("NONE");
  });
  it("boş, küçük harf ve bilinmeyen değerde süzgeç yok", () => {
    expect(parseAiFilter(null)).toBeUndefined();
    expect(parseAiFilter("")).toBeUndefined();
    expect(parseAiFilter("red")).toBeUndefined();
    expect(parseAiFilter("ALL")).toBeUndefined();
    expect(parseAiFilter("RED; drop table")).toBeUndefined();
  });
});
