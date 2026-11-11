import { z } from "zod";
import { QUESTION_LETTERS, QUESTION_PROGRAMS, QUESTION_SOURCES } from "./rules";

const text = (max: number) => z.string().trim().min(1).max(max);

const optionalText = (max: number) => z.string().trim().max(max).nullish();

// Üreticinin "dayanak" bilgisi; hepsi isteğe bağlı (eski satırlarda ve LLM sorularında yok).
export const questionMetaSchema = z.object({
  reference_question: optionalText(200),
  objective_text: optionalText(400),
  form: optionalText(40),
  course: optionalText(100),
  option_origins: z.array(z.string().trim().max(200)).max(5).optional(),
  params: z.record(z.string().max(60), z.union([z.string().max(200), z.number(), z.boolean()])).optional(),
});

export const questionBodySchema = z.object({
  stem: text(3000),
  options: z.array(text(600)).length(5),
  key: z.enum(QUESTION_LETTERS),
  explanation: z
    .string()
    .trim()
    .max(2000)
    .nullish()
    .transform((v) => (v ? v : null)),
  meta: questionMetaSchema.optional(),
});

export const ingestItemSchema = z.object({
  source: z.enum(QUESTION_SOURCES),
  // Zorunlu: CRM sınavı tahmin etmez; eksik program gelen soru partiyi 400 ile düşürür.
  program: z.enum(QUESTION_PROGRAMS),
  subject: text(60),
  objective_code: z
    .string()
    .trim()
    .max(60)
    .nullish()
    .transform((v) => (v ? v : null)),
  model: text(100),
  body: questionBodySchema,
});

const runDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "run_date");

/** Gece yazıcısı: bir kaynağın bir gecelik partisi (en fazla 50 soru). */
export const ingestBatchSchema = z.object({
  run_date: runDate,
  source: z.enum(QUESTION_SOURCES),
  requested: z.number().int().min(0).max(1000),
  items: z.array(ingestItemSchema).max(50),
});

export const questionDecisionSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  review_note: z
    .string()
    .trim()
    .max(500)
    .nullish()
    .transform((v) => (v ? v : null)),
});

export type IngestBatchInput = z.infer<typeof ingestBatchSchema>;
export type QuestionDecisionInput = z.infer<typeof questionDecisionSchema>;
