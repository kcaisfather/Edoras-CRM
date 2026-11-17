/**
 * Öğrenci soru itirazları (panel migration 398 `mini_test_question_objections`): CRM "İtirazlar" listesinin saf kuralları.
 * Panel yazar (öğrenci mobilde "İtiraz et"), CRM yalnız okur ve kapatır; soru OTOMATİK GİZLENMEZ — karar insanda
 * ("Onayı geri al" ya da itirazı kapat).
 */

export const OBJECTION_REASONS = [
  "wrong_key",
  "unclear",
  "typo",
  "other",
] as const;
export type ObjectionReason = (typeof OBJECTION_REASONS)[number];

/** Panel `lib/question-objection` ile aynı metinler (CRM paneli içe aktaramaz). */
export const OBJECTION_REASON_LABELS: Record<ObjectionReason, string> = {
  wrong_key: "Cevap anahtarı yanlış",
  unclear: "Soru anlaşılmıyor / eksik",
  typo: "Yazım ya da şekil hatası",
  other: "Diğer",
};

export type ObjectionRow = {
  question_id: string;
  reason: string;
  note: string | null;
  source: string;
  created_at: string;
};

export type ObjectedQuestionRow = {
  id: string;
  crm_question_id: string;
  subject: string;
  stem: string;
  options: string[];
  answer_key: string;
  explanation: string | null;
  active: boolean;
};

export type ObjectedQuestion = {
  questionId: string;
  crmQuestionId: string;
  subject: string;
  stem: string;
  options: string[];
  answerKey: string;
  explanation: string | null;
  /** Soru hâlâ öğrencilere açık mı (Onayı geri alınmışsa false). */
  active: boolean;
  count: number;
  reasons: Record<ObjectionReason, number>;
  /** Öğrenci kimliği YOK: yalnız serbest notlar, en yeni önce. */
  notes: string[];
  lastAt: string;
};

function isReason(value: string): value is ObjectionReason {
  return (OBJECTION_REASONS as readonly string[]).includes(value);
}

/**
 * Açık itirazları soruya göre toplar: en çok itiraz alan, eşitse en yeni üstte. Sorusu bulunamayan itiraz (panel
 * satırı silinmiş) atlanır. Bilinmeyen neden `other` sayılır (şema check'i var, savunma amaçlı).
 */
export function groupObjections(
  rows: ObjectionRow[],
  questions: ObjectedQuestionRow[],
): ObjectedQuestion[] {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const groups = new Map<string, ObjectedQuestion>();
  for (const row of rows) {
    const q = byId.get(row.question_id);
    if (!q) continue;
    let group = groups.get(q.id);
    if (!group) {
      group = {
        questionId: q.id,
        crmQuestionId: q.crm_question_id,
        subject: q.subject,
        stem: q.stem,
        options: q.options,
        answerKey: q.answer_key,
        explanation: q.explanation,
        active: q.active,
        count: 0,
        reasons: { wrong_key: 0, unclear: 0, typo: 0, other: 0 },
        notes: [],
        lastAt: row.created_at,
      };
      groups.set(q.id, group);
    }
    group.count += 1;
    group.reasons[isReason(row.reason) ? row.reason : "other"] += 1;
    if (row.note) group.notes.push(row.note);
    if (row.created_at > group.lastAt) group.lastAt = row.created_at;
  }
  return [...groups.values()].sort(
    (a, b) => b.count - a.count || b.lastAt.localeCompare(a.lastAt),
  );
}
