import { describe, expect, it } from "vitest";
import {
  matchPoolObjective,
  programFromPublisher,
  programFromMebList,
  resolvePoolSubject,
  type ObjectiveCandidate,
} from "./objective-match";
import { OSYM_OBJECTIVE_MAP } from "./osym-objective-map";

const meb = (objectiveId: number, subjectLabel: string, program: ObjectiveCandidate["program"] = "yks"): ObjectiveCandidate => ({
  objectiveId,
  source: "meb",
  subjectLabel,
  program,
});
const publisher = (objectiveId: number, subjectLabel: string, program: ObjectiveCandidate["program"] = null): ObjectiveCandidate => ({
  objectiveId,
  source: "publisher",
  subjectLabel,
  program,
});
const learning = (objectiveId: number, subjectLabel: string, program: ObjectiveCandidate["program"]): ObjectiveCandidate => ({
  objectiveId,
  source: "learning_objective",
  subjectLabel,
  program,
});

describe("resolvePoolSubject", () => {
  it("kısaltmaları ve ÖSYM kodunu gerçek derse çevirir", () => {
    expect(resolvePoolSubject("FİZ", "FİZ.10.3.4")).toBe("Fizik");
    expect(resolvePoolSubject("ÖSYM", "AYT.FIZ.06.03")).toBe("Fizik");
    expect(resolvePoolSubject("ÖSYM", "TYT.TUR.04.08")).toBe("Türkçe");
    expect(resolvePoolSubject("ÖSYM", "AYT.TUR.05.05")).toBe("Türk Dili ve Edebiyatı");
    expect(resolvePoolSubject("Tarih", "10.3.1")).toBe("Tarih");
    expect(resolvePoolSubject("ÖSYM", "TYT.MAT.08.05")).toBe("Matematik");
    expect(resolvePoolSubject("ÖSYM", "TYT.TAR.03.01")).toBe("Tarih");
  });

  it("ÖSYM eşleme listesindeki her kodun dersi çözülür, metni yanlış çıkan kodlar listede yok", () => {
    expect(OSYM_OBJECTIVE_MAP.size).toBe(38);
    for (const code of OSYM_OBJECTIVE_MAP.keys()) expect(resolvePoolSubject("ÖSYM", code)).not.toBeNull();
    for (const excluded of ["AYT.FIZ.07.06", "AYT.MAT.10.07", "AYT.MAT.11.03", "TYT.MAT.11.03"]) {
      expect(OSYM_OBJECTIVE_MAP.has(excluded)).toBe(false);
    }
  });

  it("çözülemeyen ÖSYM dersi null döner", () => {
    expect(resolvePoolSubject("ÖSYM", "AYT.MANTIK.K1183")).toBeNull();
    expect(resolvePoolSubject("ÖSYM", null)).toBeNull();
  });
});

describe("matchPoolObjective", () => {
  it("aynı kod başka derslerde olsa da doğru dersi seçer", () => {
    expect(matchPoolObjective("Tarih", [meb(1, "Coğrafya"), meb(2, "Tarih"), publisher(3, "TYT Fizik")], "yks")).toEqual({
      kind: "matched",
      objectiveId: 2,
    });
  });

  it("sınıf ve sınav önekini yok sayar", () => {
    expect(matchPoolObjective("Fizik", [learning(9, "10. Sınıf Fizik", "yks")], "yks")).toEqual({
      kind: "matched",
      objectiveId: 9,
    });
  });

  it("MEB ve yayıncı aynı dersteyse MEB kazanır", () => {
    expect(matchPoolObjective("Fizik", [publisher(5, "TYT Fizik"), meb(6, "Fizik")], "yks")).toEqual({ kind: "matched", objectiveId: 6 });
  });

  it("iki MEB ya da iki yayıncı adayı belirsizdir", () => {
    expect(matchPoolObjective("Fizik", [meb(1, "Fizik"), meb(2, "Fizik")], "yks").kind).toBe("ambiguous");
    expect(matchPoolObjective("Fizik", [publisher(1, "TYT Fizik"), publisher(2, "AYT Fizik")], "yks").kind).toBe("ambiguous");
  });

  it("aynı ders yoksa bulunamadı", () => {
    expect(matchPoolObjective("Tarih", [meb(1, "Coğrafya")], "yks").kind).toBe("not_found");
    expect(matchPoolObjective("Tarih", [], "yks").kind).toBe("not_found");
  });

  it("başka sınavın adayı elenir: LGS sorusu YKS kazanımına bağlanmaz", () => {
    expect(matchPoolObjective("Matematik", [meb(1, "Matematik", "yks")], "lgs").kind).toBe("not_found");
    expect(matchPoolObjective("Matematik", [meb(1, "Matematik", "yks"), learning(2, "LGS Matematik", "lgs")], "lgs")).toEqual({
      kind: "matched",
      objectiveId: 2,
    });
  });

  it("aynı ders + kod iki sınavda varsa program belirsizliği çözer", () => {
    const both = [learning(1, "LGS Türkçe", "lgs"), learning(2, "TYT Türkçe", "yks")];
    expect(matchPoolObjective("Türkçe", both, "yks")).toEqual({ kind: "matched", objectiveId: 2 });
    expect(matchPoolObjective("Türkçe", both, "lgs")).toEqual({ kind: "matched", objectiveId: 1 });
  });

  it("programı bilinmeyen aday her sınavla uyumludur", () => {
    expect(matchPoolObjective("Fizik", [publisher(4, "Fizik", null)], "lgs")).toEqual({ kind: "matched", objectiveId: 4 });
  });
});

describe("aday programı", () => {
  it("MEB listesinin adından", () => {
    expect(programFromMebList("ttkb-yks-2026")).toBe("yks");
    expect(programFromMebList("ttkb-lgs-2026")).toBe("lgs");
    expect(programFromMebList(null)).toBeNull();
  });

  it("yayıncı: önce sınıf düzeyi, yoksa ders öneki (canlıdaki biçimler: '9', '12', 'YKS', boş)", () => {
    expect(programFromPublisher("10. Sınıf", "Fizik")).toBe("yks");
    expect(programFromPublisher("12", "Matematik")).toBe("yks");
    expect(programFromPublisher("YKS", "Matematik")).toBe("yks");
    expect(programFromPublisher("Mezun", null)).toBe("yks");
    expect(programFromPublisher("8", "Matematik")).toBe("lgs");
    expect(programFromPublisher(null, "TYT Fizik")).toBe("yks");
    expect(programFromPublisher(null, "LGS Türkçe")).toBe("lgs");
    expect(programFromPublisher(null, "4. Sınıf Matematik")).toBe("lgs");
    expect(programFromPublisher(null, "11. Sınıf Tarih")).toBe("yks");
    expect(programFromPublisher(null, "Matematik-1")).toBeNull();
  });
});
