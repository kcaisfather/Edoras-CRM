import { describe, expect, it } from "vitest";
import { COUNTRIES, COUNTRY_NAMES, DEFAULT_COUNTRY } from "./countries";
import { canonicalCountry, countryCode, isTurkey, normalizeSearch } from "./tr-locations";

const members = COUNTRIES.filter((c) => c.un === "member");

describe("countries dataset", () => {
  it("has the UN member states except GKRY (founder decision)", () => {
    expect(members).toHaveLength(192);
    expect(COUNTRIES.some((c) => c.code === "CY")).toBe(false);
    expect(COUNTRIES.filter((c) => c.un === "observer").map((c) => c.name)).toEqual(["Filistin", "Vatikan"]);
  });

  it("has unique ISO alpha-2 codes and names", () => {
    const codes = COUNTRIES.map((c) => c.code).filter((c): c is string => c != null);
    expect(new Set(codes).size).toBe(codes.length);
    for (const c of members) expect(c.code, c.name).toMatch(/^[A-Z]{2}$/);
    expect(new Set(COUNTRY_NAMES.map(normalizeSearch)).size).toBe(COUNTRIES.length);
  });

  it("puts Türkiye first, then members in Turkish alphabetical order", () => {
    expect(COUNTRY_NAMES[0]).toBe(DEFAULT_COUNTRY);
    expect(COUNTRIES[0].code).toBe("TR");
    const rest = members.slice(1).map((c) => c.name);
    expect(rest).toEqual([...rest].sort((a, b) => a.localeCompare(b, "tr")));
    expect(rest.indexOf("Çad")).toBeGreaterThan(rest.indexOf("Butan"));
    expect(rest.indexOf("Irak")).toBeLessThan(rest.indexOf("İran"));
    // Gözlemci ve BM dışı ülkeler üyelerden sonra.
    expect(COUNTRIES.findIndex((c) => c.un !== "member")).toBe(members.length);
  });

  it("aliases have no collisions across countries", () => {
    const owner = new Map<string, string>();
    for (const c of COUNTRIES) {
      for (const k of [c.name, c.code, ...(c.aliases ?? [])]) {
        const key = normalizeSearch(k);
        if (!key) continue;
        expect(owner.get(key) ?? c.name, `${k} (${c.name})`).toBe(c.name);
        owner.set(key, c.name);
      }
    }
  });

  it("maps ISO codes ↔ Turkish names (billing profile)", () => {
    expect(countryCode("Türkiye")).toBe("TR");
    expect(canonicalCountry("TR")).toBe("Türkiye");
    expect(canonicalCountry("US")).toBe("Amerika Birleşik Devletleri");
    expect(canonicalCountry("ABD")).toBe("Amerika Birleşik Devletleri");
    expect(countryCode("Almanya")).toBe("DE");
    expect(canonicalCountry("Holy See")).toBe("Vatikan");
    expect(isTurkey("Türkmenistan")).toBe(false);
  });
});
