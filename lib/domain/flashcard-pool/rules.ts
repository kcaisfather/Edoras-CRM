/**
 * Bilgi kartı havuzu kuralları (saf). Deste kazanım KİMLİĞİYLE gelir (Edoras `objective_registry.id`); soru havuzundaki
 * kod → ders eşleştirmesi burada yok. Panel tarafı: Edoras migration 379 + `lib/flashcards` (en az 4 kart).
 */
import { createHash } from "node:crypto";

/** Panelde deste açılması için gereken en az kart (Edoras `FLASHCARD_MIN_CARDS` ile AYNI). */
export const FLASHCARD_MIN_CARDS = 4;
export const FLASHCARD_MAX_CARDS = 20;

export type FlashcardCard = { id: string; front: string; back: string };
export type FlashcardDraft = { front: string; back: string };

const collapse = (text: string) => text.toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").trim();

/** Aynı kazanım + aynı kart ön/arka yüzleri → aynı özet. Büyük/küçük harf ve boşluk farkı yok sayılır. */
export function deckContentHash(objectiveId: number, cards: readonly FlashcardDraft[]): string {
  const parts = [String(objectiveId), ...cards.flatMap((c) => [collapse(c.front), collapse(c.back)])];
  return createHash("sha256").update(parts.join("␟"), "utf8").digest("hex");
}

/** Onayda çıkarılan kartlar düşülünce kalan kartlar. Bilinmeyen kimlik yok sayılır. */
export function keptCards(cards: readonly FlashcardCard[], excludedIds: readonly string[]): FlashcardCard[] {
  const excluded = new Set(excludedIds);
  return cards.filter((card) => !excluded.has(card.id));
}

/** Aynı ön yüzlü iki kart (büyük/küçük harf ve boşluk farkı yok sayılarak) destede tekrar sayılır. */
export function hasDuplicateFronts(cards: readonly FlashcardDraft[]): boolean {
  const seen = new Set<string>();
  for (const card of cards) {
    const key = collapse(card.front);
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}
