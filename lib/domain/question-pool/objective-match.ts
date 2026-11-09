/**
 * Havuz sorusunu panel kazanımına bağlar (saf). Kod tek başına benzersiz değil (`10.3.1` beş derste var): önce ders,
 * birden çok aday kalırsa tek MEB satırı kazanır (havuz kodları MEB listesinden; yayıncı aynı kodu kendi sisteminde
 * kullanabilir). Havuzda program alanı yok: aynı ders + kod iki MEB programında varsa belirsiz sayılır, aktarılmaz.
 */

export type ObjectiveCandidate = {
  objectiveId: number;
  source: "meb" | "learning_objective" | "publisher";
  subjectLabel: string | null;
};

export type ObjectiveMatch = { kind: "matched"; objectiveId: number } | { kind: "ambiguous" } | { kind: "not_found" };

const SUBJECT_ABBREVIATIONS: Record<string, string> = { FİZ: "Fizik", MAT: "Matematik", COĞ: "Coğrafya" };

const CODE_SUBJECTS: Record<string, string> = {
  BIY: "Biyoloji",
  FIZ: "Fizik",
  KIM: "Kimya",
  FEL: "Felsefe",
  MAT: "Matematik",
  TAR: "Tarih",
  COG: "Coğrafya",
};

/** AIG'nin `ÖSYM` / `FİZ` gibi ders alanından gerçek ders adı; çözülemezse null. */
export function resolvePoolSubject(subject: string, objectiveCode: string | null): string | null {
  if (subject !== "ÖSYM") return SUBJECT_ABBREVIATIONS[subject] ?? subject;
  const [family, abbreviation] = (objectiveCode ?? "").split(".");
  if (abbreviation === "TUR") return family === "TYT" ? "Türkçe" : family === "AYT" ? "Türk Dili ve Edebiyatı" : null;
  return CODE_SUBJECTS[abbreviation] ?? null;
}

/** "TYT Fizik", "9. Sınıf Fizik", "Coğrafya-1" → aynı ders anahtarı. */
function subjectKey(label: string): string {
  return label
    .replace(/^(TYT|AYT)\s+/i, "")
    .replace(/^\d+\.\s*Sınıf\s+/i, "")
    .replace(/-\d+$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("tr-TR");
}

export function matchPoolObjective(subject: string, candidates: readonly ObjectiveCandidate[]): ObjectiveMatch {
  const key = subjectKey(subject);
  const sameSubject = candidates.filter((c) => c.subjectLabel !== null && subjectKey(c.subjectLabel) === key);
  if (sameSubject.length === 0) return { kind: "not_found" };
  if (sameSubject.length === 1) return { kind: "matched", objectiveId: sameSubject[0].objectiveId };
  const meb = sameSubject.filter((c) => c.source === "meb");
  return meb.length === 1 ? { kind: "matched", objectiveId: meb[0].objectiveId } : { kind: "ambiguous" };
}
