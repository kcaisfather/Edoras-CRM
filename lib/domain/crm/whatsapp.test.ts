import { describe, expect, it } from "vitest";
import { isWhatsAppUsername, normalizeWhatsAppUsername } from "./whatsapp";

describe("WhatsApp kullanıcı adı", () => {
  it("@ işaretini atar, küçültür, boşlukları kırpar", () => {
    expect(normalizeWhatsAppUsername("  @Ayse.Yilmaz ")).toBe("ayse.yilmaz");
    expect(normalizeWhatsAppUsername("")).toBe("");
  });

  it("WhatsApp kuralına uyanları kabul eder", () => {
    for (const v of ["ayse.yilmaz", "@Kurum_2026", "abc"]) expect(isWhatsAppUsername(v)).toBe(true);
  });

  it("kısa, uzun, harfsiz, boşluklu ya da Türkçe karakterli adı reddeder", () => {
    for (const v of ["", "ab", "a".repeat(36), "123_45", "ay se", "ayşe", "ad-soyad"]) expect(isWhatsAppUsername(v)).toBe(false);
  });
});
