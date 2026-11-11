/**
 * Havuz sorusunu panel kazanımına bağlar (saf). Kod tek başına benzersiz değil (`10.3.1` beş derste var): önce sınav
 * (sorunun `program`ı üreticiden gelir; programı bilinmeyen aday elenmez), sonra ders; birden çok aday kalırsa tek MEB
 * satırı kazanır (havuz kodları MEB listesinden; yayıncı aynı kodu kendi sisteminde kullanabilir).
 */
import type { QuestionProgram } from "./rules";

export type ObjectiveCandidate = {
  objectiveId: number;
  source: "meb" | "learning_objective" | "publisher";
  subjectLabel: string | null;
  /** Adayın sınavı; çıkarılamıyorsa null (her programla uyumlu sayılır). */
  program: QuestionProgram | null;
};

/** MEB listesinin adı (`ttkb-yks-2026`) → sınav. */
export function programFromMebList(list: string | null | undefined): QuestionProgram | null {
  const value = (list ?? "").toLocaleLowerCase("tr-TR");
  if (value.includes("lgs")) return "lgs";
  if (value.includes("yks")) return "yks";
  return null;
}

const programFromGrade = (grade: number): QuestionProgram | null =>
  grade >= 9 && grade <= 12 ? "yks" : grade >= 1 && grade <= 8 ? "lgs" : null;

/**
 * Yayıncı kazanımının sınavı: önce sınıf düzeyi ("9", "12.", "YKS", "Mezun"), yoksa ders öneki ("TYT Fizik",
 * "LGS Türkçe", "4. Sınıf Matematik"); ikisi de yoksa null. Panel 384 ve üreticinin export-kazanimlar.sql'i aynı kural.
 */
export function programFromPublisher(
  gradeLabel: string | null | undefined,
  subjectLabel: string | null | undefined
): QuestionProgram | null {
  const grade = (gradeLabel ?? "").trim();
  const gradeNumber = /^(\d{1,2})(?!\d)/.exec(grade)?.[1];
  if (gradeNumber) return programFromGrade(Number(gradeNumber));
  if (/^(yks|mezun)/i.test(grade)) return "yks";
  if (/^lgs/i.test(grade)) return "lgs";
  const subject = (subjectLabel ?? "").trim();
  if (/^(TYT|AYT|YDT)\s/i.test(subject)) return "yks";
  if (/^LGS\s/i.test(subject)) return "lgs";
  const subjectGrade = /^(\d{1,2})\.\s*Sınıf/i.exec(subject)?.[1];
  return subjectGrade ? programFromGrade(Number(subjectGrade)) : null;
}

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

/** "TYT Fizik", "LGS Matematik", "9. Sınıf Fizik", "Coğrafya-1" → aynı ders anahtarı. */
function subjectKey(label: string): string {
  return label
    .replace(/^(TYT|AYT|LGS)\s+/i, "")
    .replace(/^\d+\.\s*Sınıf\s+/i, "")
    .replace(/-\d+$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("tr-TR");
}

export function matchPoolObjective(
  subject: string,
  candidates: readonly ObjectiveCandidate[],
  program: QuestionProgram
): ObjectiveMatch {
  const key = subjectKey(subject);
  const sameSubject = candidates.filter(
    (c) => (c.program === null || c.program === program) && c.subjectLabel !== null && subjectKey(c.subjectLabel) === key
  );
  if (sameSubject.length === 0) return { kind: "not_found" };
  if (sameSubject.length === 1) return { kind: "matched", objectiveId: sameSubject[0].objectiveId };
  const meb = sameSubject.filter((c) => c.source === "meb");
  return meb.length === 1 ? { kind: "matched", objectiveId: meb[0].objectiveId } : { kind: "ambiguous" };
}
