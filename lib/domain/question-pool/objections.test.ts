import { describe, expect, it } from "vitest";
import {
  groupObjections,
  type ObjectedQuestionRow,
  type ObjectionRow,
} from "./objections";

const q = (id: string, active = true): ObjectedQuestionRow => ({
  id,
  crm_question_id: `crm-${id}`,
  subject: "Biyoloji",
  stem: `soru ${id}`,
  options: ["a", "b", "c", "d", "e"],
  answer_key: "C",
  explanation: null,
  active,
});
const o = (
  question_id: string,
  reason: string,
  created_at: string,
  note: string | null = null,
): ObjectionRow => ({
  question_id,
  reason,
  note,
  source: "mini_test",
  created_at,
});

describe("groupObjections", () => {
  it("soruya göre toplar, neden sayar, notları en yeni önce tutar", () => {
    const result = groupObjections(
      [
        o("a", "wrong_key", "2026-11-17T10:00:00Z", "ilk"),
        o("a", "typo", "2026-11-17T12:00:00Z"),
        o("a", "wrong_key", "2026-11-17T11:00:00Z", "ikinci"),
      ],
      [q("a")],
    );
    expect(result).toHaveLength(1);
    expect(result[0].count).toBe(3);
    expect(result[0].reasons).toEqual({
      wrong_key: 2,
      unclear: 0,
      typo: 1,
      other: 0,
    });
    expect(result[0].lastAt).toBe("2026-11-17T12:00:00Z");
    expect(result[0].notes).toEqual(["ilk", "ikinci"]);
  });

  it("en çok itiraz alan üstte, eşitlikte en yeni üstte", () => {
    const result = groupObjections(
      [
        o("a", "other", "2026-11-17T09:00:00Z"),
        o("b", "other", "2026-11-17T10:00:00Z"),
        o("b", "other", "2026-11-17T10:30:00Z"),
        o("c", "other", "2026-11-17T11:00:00Z"),
      ],
      [q("a"), q("b"), q("c")],
    );
    expect(result.map((r) => r.questionId)).toEqual(["b", "c", "a"]);
  });

  it("sorusu bulunamayan itirazı atlar, bilinmeyen nedeni 'other' sayar, pasif soruyu işaretler", () => {
    const result = groupObjections(
      [
        o("yok", "wrong_key", "2026-11-17T09:00:00Z"),
        o("p", "garip", "2026-11-17T09:00:00Z"),
      ],
      [q("p", false)],
    );
    expect(result).toHaveLength(1);
    expect(result[0].reasons.other).toBe(1);
    expect(result[0].active).toBe(false);
  });
});
