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

describe("dayanak bilgisi (meta)", () => {
  const withMeta = {
    ...BODY,
    meta: {
      reference_question: "2023-AYT Edebiyat · arşiv 146",
      objective_text: "Dönem sanatçıları",
      form: "girisli",
      option_origins: ["anahtar", "dolgu", "dolgu", "dolgu", "dolgu"],
      params: { sanatci: "Ziya Paşa", sikVeri: true, n: 3 },
    },
  };
  const batch = (body: unknown) => ({
    run_date: "2026-11-05",
    source: "AIG",
    requested: 1,
    items: [{ source: "AIG", subject: "ÖSYM", model: "m", body }],
  });

  it("meta olan ve olmayan gövde kabul edilir, meta korunur", () => {
    const withIt = ingestBatchSchema.safeParse(batch(withMeta));
    expect(withIt.success).toBe(true);
    if (withIt.success) expect(withIt.data.items[0].body.meta?.reference_question).toBe("2023-AYT Edebiyat · arşiv 146");
    expect(ingestBatchSchema.safeParse(batch(BODY)).success).toBe(true);
  });

  it("meta özeti değiştirmez ve aşırı uzun değer reddedilir", () => {
    expect(questionContentHash("AIG", "ÖSYM", withMeta)).toBe(questionContentHash("AIG", "ÖSYM", BODY));
    const tooLong = { ...withMeta, meta: { ...withMeta.meta, reference_question: "x".repeat(201) } };
    expect(ingestBatchSchema.safeParse(batch(tooLong)).success).toBe(false);
  });
});
