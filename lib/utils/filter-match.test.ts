import { describe, expect, it } from "vitest";
import { distinctOptions, phoneMatches, phoneQueryDigits, presenceMatches, sameText, textIncludes } from "./filter-match";

describe("filter-match", () => {
  it("textIncludes: Türkçe harf ve büyük/küçük farkı yok", () => {
    expect(textIncludes("Bakırköy Açı Koleji", "AÇI")).toBe(true);
    expect(textIncludes("İstanbul", "istanbul")).toBe(true);
    expect(textIncludes("ISTANBUL", "İstanbul")).toBe(true);
    expect(textIncludes(null, "x")).toBe(false);
    expect(textIncludes(null, "  ")).toBe(true);
  });

  it("sameText: tam eşitlik (içerme değil), boş seçim hepsi", () => {
    expect(sameText("Şarköy", "ŞARKÖY")).toBe(true);
    expect(sameText("Edirne Merkez", "Edirne")).toBe(false);
    expect(sameText(null, "")).toBe(true);
    expect(sameText(null, "Edirne")).toBe(false);
  });

  it("phoneMatches: E.164 ve ham yazım, baştaki sıfır", () => {
    expect(phoneQueryDigits("0532 123")).toBe("532123");
    expect(phoneMatches("0532 123", "+905321234567")).toBe(true);
    expect(phoneMatches("0284 235", null, "0284 235 05 01")).toBe(true);
    expect(phoneMatches("0555", "+905321234567")).toBe(false);
    expect(phoneMatches("", null)).toBe(true);
    expect(phoneMatches("abc", null)).toBe(true);
  });

  it("presenceMatches", () => {
    expect(presenceMatches(true, "yes")).toBe(true);
    expect(presenceMatches(false, "yes")).toBe(false);
    expect(presenceMatches(false, "no")).toBe(true);
    expect(presenceMatches(false, "")).toBe(true);
  });

  it("distinctOptions: yazım farkını birleştirir, boşları atar, Türkçe sıralar", () => {
    expect(distinctOptions(["İzmir", "istanbul", "İstanbul", "", null, " Çorum ", "Ankara"])).toEqual(["Ankara", "Çorum", "istanbul", "İzmir"]);
  });
});
