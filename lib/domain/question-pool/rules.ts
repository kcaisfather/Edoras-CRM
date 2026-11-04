/**
 * Soru havuzu kuralları (saf). Gece üretici (YKS) ile CRM ucu aynı içerik özetini hesaplamak zorunda değil: özet
 * CRM tarafında üretilir; üretici yalnız gövdeyi yollar. Aynı soru iki kez girmesin diye içerik özeti kaynak + ders +
 * normalize edilmiş kök + şıklardan çıkar.
 */
import { createHash } from "node:crypto";

export const QUESTION_SOURCES = ["AIG", "LLM"] as const;
export type QuestionSource = (typeof QUESTION_SOURCES)[number];

export const QUESTION_LETTERS = ["A", "B", "C", "D", "E"] as const;

export type QuestionBody = {
  stem: string;
  options: string[];
  key: (typeof QUESTION_LETTERS)[number];
  explanation: string | null;
};

const collapse = (text: string) => text.toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").trim();

/** Aynı kaynak + ders + kök + şıklar → aynı özet. Büyük/küçük harf ve boşluk farkı yok sayılır. */
export function questionContentHash(source: QuestionSource, subject: string, body: QuestionBody): string {
  const parts = [source, collapse(subject), collapse(body.stem), ...body.options.map(collapse)];
  return createHash("sha256").update(parts.join("␟"), "utf8").digest("hex");
}

/** Şık sayısı 5 ve anahtar geçerli bir harf olmalı; aksi halde soru havuza girmez. */
export function isWellFormedBody(body: QuestionBody): boolean {
  return body.options.length === 5 && body.options.every((o) => o.trim().length > 0) && QUESTION_LETTERS.includes(body.key);
}
