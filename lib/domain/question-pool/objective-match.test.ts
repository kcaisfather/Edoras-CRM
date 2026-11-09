import { describe, expect, it } from "vitest";
import { matchPoolObjective, resolvePoolSubject, type ObjectiveCandidate } from "./objective-match";
import { OSYM_OBJECTIVE_MAP } from "./osym-objective-map";

const meb = (objectiveId: number, subjectLabel: string): ObjectiveCandidate => ({ objectiveId, source: "meb", subjectLabel });
const publisher = (objectiveId: number, subjectLabel: string): ObjectiveCandidate => ({
  objectiveId,
  source: "publisher",
  subjectLabel,
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
    expect(matchPoolObjective("Tarih", [meb(1, "Coğrafya"), meb(2, "Tarih"), publisher(3, "TYT Fizik")])).toEqual({
      kind: "matched",
      objectiveId: 2,
    });
  });

  it("sınıf ve sınav önekini yok sayar", () => {
    expect(matchPoolObjective("Fizik", [{ objectiveId: 9, source: "learning_objective", subjectLabel: "10. Sınıf Fizik" }])).toEqual({
      kind: "matched",
      objectiveId: 9,
    });
  });

  it("MEB ve yayıncı aynı dersteyse MEB kazanır", () => {
    expect(matchPoolObjective("Fizik", [publisher(5, "TYT Fizik"), meb(6, "Fizik")])).toEqual({ kind: "matched", objectiveId: 6 });
  });

  it("iki MEB ya da iki yayıncı adayı belirsizdir", () => {
    expect(matchPoolObjective("Fizik", [meb(1, "Fizik"), meb(2, "Fizik")]).kind).toBe("ambiguous");
    expect(matchPoolObjective("Fizik", [publisher(1, "TYT Fizik"), publisher(2, "AYT Fizik")]).kind).toBe("ambiguous");
  });

  it("aynı ders yoksa bulunamadı", () => {
    expect(matchPoolObjective("Tarih", [meb(1, "Coğrafya")]).kind).toBe("not_found");
    expect(matchPoolObjective("Tarih", []).kind).toBe("not_found");
  });
});
