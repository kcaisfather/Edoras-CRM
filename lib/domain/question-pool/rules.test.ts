import { describe, expect, it } from "vitest";
import { isWellFormedBody, questionContentHash, type QuestionBody } from "./rules";
import { ingestBatchSchema } from "./schemas";

const BODY: QuestionBody = {
  stem: "Bir sayının karesi 49 ise sayı kaçtır?",
  options: ["3", "5", "7", "9", "11"],
  key: "C",
  explanation: null,
};

describe("soru özeti", () => {
  it("büyük/küçük harf ve boşluk farkı aynı soruyu verir", () => {
    const variant = { ...BODY, stem: "  BİR   sayının karesi 49 ise sayı kaçtır? " };
    expect(questionContentHash("AIG", "Matematik", variant)).toBe(questionContentHash("AIG", "Matematik", BODY));
  });

  it("kaynak ya da ders farklıysa özet farklıdır", () => {
    expect(questionContentHash("LLM", "Matematik", BODY)).not.toBe(questionContentHash("AIG", "Matematik", BODY));
    expect(questionContentHash("AIG", "Fizik", BODY)).not.toBe(questionContentHash("AIG", "Matematik", BODY));
  });

  it("şık sırası değişirse farklı soru sayılır (anahtar konumu değişir)", () => {
    const shuffled = { ...BODY, options: ["5", "3", "7", "9", "11"] };
    expect(questionContentHash("AIG", "Matematik", shuffled)).not.toBe(questionContentHash("AIG", "Matematik", BODY));
  });
});

describe("soru biçimi", () => {
  it("5 dolu şık ve geçerli anahtar kabul edilir", () => {
    expect(isWellFormedBody(BODY)).toBe(true);
  });

  it("boş şık ya da 4 şıklı soru havuza girmez", () => {
    expect(isWellFormedBody({ ...BODY, options: ["3", " ", "7", "9", "11"] })).toBe(false);
    expect(isWellFormedBody({ ...BODY, options: ["3", "5", "7", "9"] })).toBe(false);
  });
});

describe("gece partisi şeması", () => {
  const item = { source: "AIG", subject: "Matematik", model: "m", body: BODY };

  it("en fazla 50 soru kabul eder, 51 reddeder", () => {
    const ok = ingestBatchSchema.safeParse({ run_date: "2026-11-05", source: "AIG", requested: 20, items: Array(50).fill(item) });
    const over = ingestBatchSchema.safeParse({ run_date: "2026-11-05", source: "AIG", requested: 20, items: Array(51).fill(item) });
    expect(ok.success).toBe(true);
    expect(over.success).toBe(false);
  });

  it("tarih biçimi ve bilinmeyen kaynak reddedilir", () => {
    expect(ingestBatchSchema.safeParse({ run_date: "05.11.2026", source: "AIG", requested: 0, items: [] }).success).toBe(false);
    expect(ingestBatchSchema.safeParse({ run_date: "2026-11-05", source: "HUMAN", requested: 0, items: [] }).success).toBe(false);
  });
});
