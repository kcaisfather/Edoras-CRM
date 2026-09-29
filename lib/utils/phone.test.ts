import { describe, expect, it } from "vitest";
import { normalizeEmail, normalizeTrPhone, toTelLink, toWhatsAppLink } from "./phone";

describe("normalizeTrPhone", () => {
  it.each([
    ["0532 123 45 67", "+905321234567"],
    ["5321234567", "+905321234567"],
    ["(0532) 123-45-67", "+905321234567"],
    ["905321234567", "+905321234567"],
    ["+90 532 123 45 67", "+905321234567"],
    ["+90 0532 123 45 67", "+905321234567"],
    ["0090 532 123 45 67", "+905321234567"],
    ["0212 555 00 11", "+902125550011"],
    ["0850 111 22 33", "+908501112233"],
    ["+49 30 1234567", "+49301234567"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeTrPhone(input)).toBe(expected);
  });

  it.each([null, undefined, "", "   ", "abc", "12345", "0132 123 45 67", "053212345678", "+90 12"])(
    "%s → null",
    (input) => {
      expect(normalizeTrPhone(input)).toBeNull();
    }
  );
});

describe("links", () => {
  it("wa.me linki + ile başlamaz, metni kodlar", () => {
    expect(toWhatsAppLink("0532 123 45 67")).toBe("https://wa.me/905321234567");
    expect(toWhatsAppLink("05321234567", "Merhaba Ayşe & ekip")).toBe(
      "https://wa.me/905321234567?text=Merhaba%20Ay%C5%9Fe%20%26%20ekip"
    );
    expect(toWhatsAppLink("yok")).toBeNull();
  });

  it("tel: linki E.164 kullanır", () => {
    expect(toTelLink("5321234567")).toBe("tel:+905321234567");
    expect(toTelLink(null)).toBeNull();
  });
});

describe("normalizeEmail", () => {
  it("trim + küçük harf", () => {
    expect(normalizeEmail("  Ali.Veli@DeepSport.App ")).toBe("ali.veli@deepsport.app");
  });
  it.each([null, undefined, "", "  ", "ali", "a b@c.d"])("%s → null", (input) => {
    expect(normalizeEmail(input)).toBeNull();
  });
});
