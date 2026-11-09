import { describe, expect, it } from "vitest";
import { matchPoolObjective, resolvePoolSubject, type ObjectiveCandidate } from "./objective-match";

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
