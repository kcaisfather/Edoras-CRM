import { z } from "zod";
import { FLASHCARD_MAX_CARDS } from "./rules";

const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

// Panel `flashcards`: front ≤ 300, back ≤ 800 (migration 379).
export const flashcardDraftSchema = z.object({ front: text(300), back: text(800) });

/** Dayandığı kaynak: kitap adı + sayfalar + kitap dosyasının özeti. Kitap metni GELMEZ. */
export const flashcardSourceRefSchema = z.object({
  book: optionalText(200),
  pages: z.array(z.number().int().min(1).max(2000)).max(40).optional(),
  book_sha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .nullish(),
  section_title: optionalText(200),
});

export const flashcardIngestItemSchema = z.object({
  objective_id: z.number().int().positive(),
  objective_code: optionalText(60),
  objective_text: optionalText(600),
  subject: text(60),
  model: text(100),
  cards: z.array(flashcardDraftSchema).min(1).max(FLASHCARD_MAX_CARDS),
  source_ref: flashcardSourceRefSchema.optional(),
});

const runDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "run_date");

/** Destesi çıkmayan kazanım: model bölümü yetersiz buldu ya da bağlam çok kısaydı. */
export const flashcardDeclineSchema = z.object({
  objective_id: z.number().int().positive(),
  reason: optionalText(300),
});

/** Gece yazıcısı: bir gecelik deste partisi (en fazla 60 deste) + destesi çıkmayan kazanımlar. */
export const flashcardIngestBatchSchema = z.object({
  run_date: runDate,
  requested: z.number().int().min(0).max(1000),
  items: z.array(flashcardIngestItemSchema).max(60),
  declined: z.array(flashcardDeclineSchema).max(200).default([]),
});

export const flashcardDecisionSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  excluded_card_ids: z.array(z.string().uuid()).max(FLASHCARD_MAX_CARDS).default([]),
  review_note: optionalText(500),
});

export type FlashcardIngestBatchInput = z.infer<typeof flashcardIngestBatchSchema>;
export type FlashcardDecisionInput = z.infer<typeof flashcardDecisionSchema>;
