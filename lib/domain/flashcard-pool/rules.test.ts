import { describe, expect, it } from "vitest";
import { flashcardDecisionSchema, flashcardIngestBatchSchema } from "./schemas";
import { deckContentHash, hasDuplicateFronts, keptCards } from "./rules";

const cards = [
  { front: "Hücre zarı", back: "Seçici geçirgen yapı." },
  { front: "Difüzyon", back: "Çoktan aza madde geçişi." },
];

describe("deckContentHash", () => {
  it("büyük/küçük harf ve boşluk farkını yok sayar", () => {
    const other = [
      { front: "  hücre   ZARI ", back: "seçici geçirgen yapı." },
      { front: "difüzyon", back: "Çoktan aza  madde geçişi." },
    ];
    expect(deckContentHash(5, cards)).toBe(deckContentHash(5, other));
  });

  it("kazanım değişince özet değişir", () => {
    expect(deckContentHash(5, cards)).not.toBe(deckContentHash(6, cards));
  });
});

describe("keptCards / hasDuplicateFronts", () => {
  it("çıkarılan kartları düşer, bilinmeyen kimliği yok sayar", () => {
    const withIds = cards.map((c, i) => ({ ...c, id: `id-${i}` }));
    expect(keptCards(withIds, ["id-1", "yok"]).map((c) => c.id)).toEqual(["id-0"]);
  });

  it("aynı ön yüz tekrar sayılır", () => {
    expect(hasDuplicateFronts([...cards, { front: "DİFÜZYON ", back: "x" }])).toBe(true);
    expect(hasDuplicateFronts(cards)).toBe(false);
  });
});

describe("şemalar", () => {
  it("kazanım kimliği zorunlu ve pozitif", () => {
    const base = { run_date: "2026-11-10", requested: 1 };
    const item = { objective_id: 0, subject: "Biyoloji", model: "claude-haiku-5-5", cards };
    expect(flashcardIngestBatchSchema.safeParse({ ...base, items: [item] }).success).toBe(false);
    expect(flashcardIngestBatchSchema.safeParse({ ...base, items: [{ ...item, objective_id: 42 }] }).success).toBe(true);
  });

  it("kartsız kazanımlar: varsayılan boş, kimlik pozitif", () => {
    const base = { run_date: "2026-11-10", requested: 1, items: [] };
    const parsed = flashcardIngestBatchSchema.safeParse(base);
    expect(parsed.success && parsed.data.declined).toEqual([]);
    expect(
      flashcardIngestBatchSchema.safeParse({ ...base, declined: [{ objective_id: 9, reason: "bölüm konuyu anlatmıyor" }] }).success,
    ).toBe(true);
    expect(flashcardIngestBatchSchema.safeParse({ ...base, declined: [{ objective_id: 0 }] }).success).toBe(false);
  });

  it("kart ön yüzü 300 karakteri aşamaz", () => {
    const item = { objective_id: 1, subject: "Fizik", model: "m", cards: [{ front: "x".repeat(301), back: "y" }] };
    expect(flashcardIngestBatchSchema.safeParse({ run_date: "2026-11-10", requested: 1, items: [item] }).success).toBe(false);
  });

  it("karar: çıkarılan kartlar uuid, varsayılan boş", () => {
    expect(flashcardDecisionSchema.parse({ decision: "APPROVED" }).excluded_card_ids).toEqual([]);
    expect(flashcardDecisionSchema.safeParse({ decision: "APPROVED", excluded_card_ids: ["x"] }).success).toBe(false);
  });
});
