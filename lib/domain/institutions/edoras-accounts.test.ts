import { describe, expect, it } from "vitest";
import {
  adminActiveSchema,
  adminEmailChangeBlock,
  adminEmailSchema,
  adminPasswordResetSchema,
  edorasLoginKind,
  isReservedLoginDomain,
  leavesNoActiveAdmin,
  loginIdentifierFor,
  normalizeLoginEmail,
} from "./edoras-accounts";

describe("giriş türü", () => {
  it("telefon @edoras.com, TC @internal.local, gerisi e-posta (büyük harf / boşluk duyarsız)", () => {
    expect(edorasLoginKind("5356416606@edoras.com")).toBe("phone");
    expect(edorasLoginKind(" 5356416606@EDORAS.COM ")).toBe("phone");
    expect(edorasLoginKind("12345678901@internal.local")).toBe("tc");
    expect(edorasLoginKind("edoras+0f1e@internal.local")).toBe("tc");
    expect(edorasLoginKind("mudur@kurum.com")).toBe("email");
    expect(edorasLoginKind(null)).toBe("email");
    expect(edorasLoginKind("")).toBe("email");
  });
  it("alt alan adı ve benzer adlar ayrılmış sayılmaz", () => {
    expect(edorasLoginKind("a@mail.edoras.com")).toBe("email");
    expect(edorasLoginKind("a@edorasapp.ai")).toBe("email");
    expect(edorasLoginKind("a@internal.localhost")).toBe("email");
  });
});

describe("ayrılmış alan adı", () => {
  it("@edoras.com ve @internal.local (sondaki nokta dahil) ayrılmış", () => {
    expect(isReservedLoginDomain("x@edoras.com")).toBe(true);
    expect(isReservedLoginDomain("X@Internal.Local")).toBe(true);
    expect(isReservedLoginDomain("x@edoras.com.")).toBe(true);
    expect(isReservedLoginDomain("x@kurum.com")).toBe(false);
    expect(isReservedLoginDomain(null)).toBe(false);
  });
});

describe("normalizeLoginEmail / loginIdentifierFor", () => {
  it("küçük harf + trim", () => {
    expect(normalizeLoginEmail("  Mudur@Kurum.COM ")).toBe("mudur@kurum.com");
  });
  it("telefon 0'lı 11 hane, TC 11 hane, e-posta olduğu gibi, yer tutucu adres olduğu gibi", () => {
    expect(loginIdentifierFor("5356416606@edoras.com")).toBe("05356416606");
    expect(loginIdentifierFor("12345678901@internal.local")).toBe("12345678901");
    expect(loginIdentifierFor("Mudur@Kurum.com")).toBe("mudur@kurum.com");
    expect(loginIdentifierFor("edoras+0f1e@internal.local")).toBe("edoras+0f1e@internal.local");
    expect(loginIdentifierFor("ali@edoras.com")).toBe("ali@edoras.com");
  });
});

describe("adminEmailChangeBlock", () => {
  const base = { currentEmail: "eski@kurum.com", nextEmail: "yeni@kurum.com", isSuperAdmin: false };
  it("süper yönetici her durumda engelli", () => {
    expect(adminEmailChangeBlock({ ...base, isSuperAdmin: true })).toBe("superAdmin");
  });
  it("telefon / TC hesabının adresi değişmez (girişi kırılır)", () => {
    expect(adminEmailChangeBlock({ ...base, currentEmail: "5356416606@edoras.com" })).toBe("loginNotEmail");
    expect(adminEmailChangeBlock({ ...base, currentEmail: "12345678901@internal.local" })).toBe("loginNotEmail");
  });
  it("yeni adres ayrılmış alan adında olamaz (başkasının telefon / TC kimliği)", () => {
    expect(adminEmailChangeBlock({ ...base, nextEmail: "5551112233@edoras.com" })).toBe("reservedDomain");
    expect(adminEmailChangeBlock({ ...base, nextEmail: "12345678901@INTERNAL.LOCAL" })).toBe("reservedDomain");
  });
  it("aynı adres (büyük harf / boşluk farkı) değişiklik değildir", () => {
    expect(adminEmailChangeBlock({ ...base, nextEmail: "  ESKI@kurum.com" })).toBe("same");
  });
  it("geçerli değişiklik ve adressiz hesap engellenmez", () => {
    expect(adminEmailChangeBlock(base)).toBeNull();
    expect(adminEmailChangeBlock({ ...base, currentEmail: null })).toBeNull();
  });
});

describe("leavesNoActiveAdmin", () => {
  const a = (userId: string, isActive: boolean) => ({ userId, isActive });
  it("başka aktif yönetici yoksa true", () => {
    expect(leavesNoActiveAdmin([a("u1", true)], "u1")).toBe(true);
    expect(leavesNoActiveAdmin([a("u1", true), a("u2", false)], "u1")).toBe(true);
    expect(leavesNoActiveAdmin([], "u1")).toBe(true);
  });
  it("başka aktif yönetici varsa false", () => {
    expect(leavesNoActiveAdmin([a("u1", true), a("u2", true)], "u1")).toBe(false);
  });
});

describe("istek şemaları", () => {
  it("e-posta: zorunlu, biçim, ayrılmış alan adı reddi", () => {
    expect(adminEmailSchema.safeParse({ email: " yeni@kurum.com " }).success).toBe(true);
    expect(adminEmailSchema.safeParse({ email: "" }).success).toBe(false);
    expect(adminEmailSchema.safeParse({ email: "kurum.com" }).success).toBe(false);
    const reserved = adminEmailSchema.safeParse({ email: "5551112233@edoras.com" });
    expect(reserved.success).toBe(false);
    expect(reserved.error?.issues[0]?.path).toEqual(["email"]);
  });
  it("aktiflik: active zorunlu boolean; onay isteğe bağlı", () => {
    expect(adminActiveSchema.safeParse({ active: false }).success).toBe(true);
    expect(adminActiveSchema.safeParse({ active: false, confirmLastAdmin: true }).success).toBe(true);
    expect(adminActiveSchema.safeParse({ active: "false" }).success).toBe(false);
    expect(adminActiveSchema.safeParse({}).success).toBe(false);
  });
  it("şifre sıfırlama: şifre isteğe bağlı, boş metin 'yok' sayılır", () => {
    expect(adminPasswordResetSchema.parse({})).toEqual({ password: undefined });
    expect(adminPasswordResetSchema.parse({ password: "" })).toEqual({ password: undefined });
    expect(adminPasswordResetSchema.parse({ password: "Mudur2026" })).toEqual({ password: "Mudur2026" });
    expect(adminPasswordResetSchema.safeParse({ other: 1 }).success).toBe(false);
  });

  it("şifre sıfırlama: Edoras paneliyle aynı kural (6 karakter – 72 bayt, kenarda boşluk yok)", () => {
    expect(adminPasswordResetSchema.safeParse({ password: "abc12" }).success).toBe(false);
    expect(adminPasswordResetSchema.safeParse({ password: "abc123" }).success).toBe(true);
    expect(adminPasswordResetSchema.safeParse({ password: " abc123" }).success).toBe(false);
    expect(adminPasswordResetSchema.safeParse({ password: "abc123 " }).success).toBe(false);
    expect(adminPasswordResetSchema.safeParse({ password: "      " }).success).toBe(false);
    expect(adminPasswordResetSchema.safeParse({ password: "a".repeat(72) }).success).toBe(true);
    expect(adminPasswordResetSchema.safeParse({ password: "a".repeat(73) }).success).toBe(false);
    // Türkçe harf UTF-8'de 2 bayt: 37 × "ş" = 74 bayt.
    expect(adminPasswordResetSchema.safeParse({ password: "ş".repeat(36) }).success).toBe(true);
    expect(adminPasswordResetSchema.safeParse({ password: "ş".repeat(37) }).success).toBe(false);
  });
});
