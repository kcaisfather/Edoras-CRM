import { describe, expect, it } from "vitest";
import {
  COUNTRIES,
  COUNTRY_NAMES,
  DEFAULT_COUNTRY,
  DEFAULT_PROVINCE,
  PROVINCES,
  canonicalCountry,
  canonicalLocation,
  canonicalDistrict,
  canonicalProvince,
  countryCode,
  districtsOf,
  filterOptions,
  findProvince,
  isTurkey,
  locationDefaults,
  normalizeSearch,
  provinceNames,
  withLocationDefaults,
} from "./tr-locations";

const count = (city: string) => districtsOf(city).length;

describe("PROVINCES dataset", () => {
  it("has 81 provinces with unique names and plate codes 1..81", () => {
    expect(PROVINCES).toHaveLength(81);
    expect(new Set(PROVINCES.map((p) => p.name)).size).toBe(81);
    expect(new Set(PROVINCES.map((p) => normalizeSearch(p.name))).size).toBe(81);
    expect(PROVINCES.map((p) => p.code).sort((a, b) => a - b)).toEqual(Array.from({ length: 81 }, (_, i) => i + 1));
  });

  it("uses official spellings for tricky provinces", () => {
    const names = PROVINCES.map((p) => p.name);
    for (const n of ["İstanbul", "İzmir", "Afyonkarahisar", "Kahramanmaraş", "Şanlıurfa", "Düzce", "Iğdır", "Muğla", "Çanakkale"]) {
      expect(names).toContain(n);
    }
    expect(findProvince("İstanbul")?.code).toBe(34);
    expect(findProvince("Düzce")?.code).toBe(81);
  });

  it("has the official district counts (973 total)", () => {
    expect(count("İstanbul")).toBe(39);
    expect(count("Ankara")).toBe(25);
    expect(count("İzmir")).toBe(30);
    expect(count("Konya")).toBe(31);
    expect(count("Bayburt")).toBe(3);
    expect(PROVINCES.reduce((n, p) => n + p.districts.length, 0)).toBe(973);
  });

  it("has no duplicate or blank district within a province", () => {
    for (const p of PROVINCES) {
      const keys = p.districts.map(normalizeSearch);
      expect(new Set(keys).size, p.name).toBe(keys.length);
      expect(keys.every((k) => k.length > 0), p.name).toBe(true);
    }
  });

  it("sorts districts with Turkish collation", () => {
    for (const p of PROVINCES) {
      const sorted = [...p.districts].sort((a, b) => a.localeCompare(b, "tr", { numeric: true }));
      expect(p.districts, p.name).toEqual(sorted);
    }
    const ist = districtsOf("İstanbul");
    // Ç, Ş, Ü kendi harf gruplarında (C/S/U'dan sonra) sıralanır.
    expect(ist.indexOf("Çatalca")).toBeGreaterThan(ist.indexOf("Büyükçekmece"));
    expect(ist.indexOf("Şile")).toBeGreaterThan(ist.indexOf("Sultangazi"));
    expect(ist.at(-1)).toBe("Zeytinburnu");
  });

  it("provinceNames() is Turkish alphabetical", () => {
    const names = provinceNames();
    expect(names).toHaveLength(81);
    expect(names.slice(0, 4)).toEqual(["Adana", "Adıyaman", "Afyonkarahisar", "Ağrı"]);
    expect(names.indexOf("Iğdır")).toBeLessThan(names.indexOf("Isparta"));
    expect(names.indexOf("Isparta")).toBeLessThan(names.indexOf("İstanbul"));
    expect(names.at(-1)).toBe("Zonguldak");
    expect([...names]).toEqual([...names].sort((a, b) => a.localeCompare(b, "tr")));
  });
});

describe("normalizeSearch", () => {
  it("folds Turkish characters and case", () => {
    expect(normalizeSearch("İSTANBUL")).toBe("istanbul");
    expect(normalizeSearch("Istanbul")).toBe("istanbul");
    expect(normalizeSearch("ıstanbul")).toBe("istanbul");
    expect(normalizeSearch("ŞANLIURFA")).toBe("sanliurfa");
    expect(normalizeSearch("Çğüşöİı")).toBe("cgusoii");
    expect(normalizeSearch("Hakkâri")).toBe("hakkari");
    expect(normalizeSearch("  Kıbrıs   (KKTC) ")).toBe("kibris (kktc)");
    expect(normalizeSearch(null)).toBe("");
  });
});

describe("findProvince / canonical helpers", () => {
  it("finds İstanbul from any casing/spelling", () => {
    for (const q of ["İSTANBUL", "istanbul", "Istanbul", "ıstanbul", " istanbul "]) {
      expect(findProvince(q)?.name, q).toBe("İstanbul");
    }
  });

  it("canonicalizes provinces", () => {
    expect(canonicalProvince("sanliurfa")).toBe("Şanlıurfa");
    expect(canonicalProvince("KAHRAMANMARAS")).toBe("Kahramanmaraş");
    expect(canonicalProvince("afyon")).toBe("Afyonkarahisar");
    expect(canonicalProvince("igdir")).toBe("Iğdır");
    expect(canonicalProvince("Istambul")).toBeNull();
    expect(canonicalProvince("")).toBeNull();
  });

  it("canonicalizes districts within their province", () => {
    expect(canonicalDistrict("Ankara", "cankaya")).toBe("Çankaya");
    expect(canonicalDistrict("ankara", "ÇANKAYA")).toBe("Çankaya");
    expect(canonicalDistrict("istanbul", "kadikoy")).toBe("Kadıköy");
    expect(canonicalDistrict("İstanbul", "Eyüp")).toBe("Eyüpsultan");
    expect(canonicalDistrict("Samsun", "Ondokuzmayıs")).toBe("19 Mayıs");
    expect(canonicalDistrict("İzmir", "Çankaya")).toBeNull();
    expect(canonicalDistrict("Bilinmeyen", "Merkez")).toBeNull();
    expect(districtsOf("Bilinmeyen")).toEqual([]);
    expect(districtsOf(undefined)).toEqual([]);
  });

  it("canonicalizes countries by name, code and alias", () => {
    expect(canonicalCountry("turkiye")).toBe("Türkiye");
    expect(canonicalCountry("Turkey")).toBe("Türkiye");
    expect(canonicalCountry("TR")).toBe("Türkiye");
    expect(canonicalCountry("germany")).toBe("Almanya");
    expect(canonicalCountry("DE")).toBe("Almanya");
    expect(canonicalCountry("kktc")).toBe("Kıbrıs (KKTC)");
    expect(canonicalCountry("usa")).toBe("Amerika Birleşik Devletleri");
    expect(canonicalCountry("Atlantis")).toBeNull();
    expect(countryCode("Türkiye")).toBe("TR");
    expect(countryCode("Kıbrıs (KKTC)")).toBeNull();
  });
});

describe("COUNTRIES", () => {
  it("starts with Türkiye then Turkish alphabetical members", () => {
    expect(DEFAULT_COUNTRY).toBe("Türkiye");
    expect(COUNTRY_NAMES[0]).toBe("Türkiye");
    const rest = COUNTRY_NAMES.slice(1);
    // BM üyeleri Türkçe alfabetik; gözlemci / BM dışı ülkeler sonda (countries.test.ts).
    const members = COUNTRIES.filter((c) => c.un === "member").slice(1).map((c) => c.name);
    expect(members).toEqual([...members].sort((a, b) => a.localeCompare(b, "tr")));
    expect(new Set(COUNTRY_NAMES).size).toBe(COUNTRIES.length);
    expect(rest).toContain("İran");
    expect(rest.indexOf("Irak")).toBeLessThan(rest.indexOf("İran"));
  });
});

describe("filterOptions", () => {
  it("returns everything for an empty query", () => {
    expect(filterOptions("", ["a", "b"])).toEqual(["a", "b"]);
    expect(filterOptions("   ", ["a", "b"])).toEqual(["a", "b"]);
  });

  it("puts prefix matches first, then word-start, then substring", () => {
    const opts = ["Başakşehir", "Beşiktaş", "Kartal", "Şişli", "Ataşehir"];
    expect(filterOptions("sehir", opts)).toEqual(["Başakşehir", "Ataşehir"]);
    expect(filterOptions("s", ["Kadıköy", "Esenler", "Sarıyer", "Şile"])).toEqual(["Sarıyer", "Şile", "Esenler"]);
    expect(filterOptions("arap", ["Karapınar", "Birleşik Arap Emirlikleri", "Almanya", "Arapgir"])).toEqual([
      "Arapgir",
      "Birleşik Arap Emirlikleri",
      "Karapınar",
    ]);
  });

  it("is Turkish-aware and works with {value,label} options", () => {
    expect(filterOptions("IST", provinceNames())).toEqual(["İstanbul"]);
    expect(filterOptions("izm", provinceNames())).toEqual(["İzmir"]);
    const opts = [
      { value: "TR", label: "Türkiye" },
      { value: "TM", label: "Türkmenistan" },
      { value: "DE", label: "Almanya" },
    ];
    expect(filterOptions("turk", opts).map((o) => o.value)).toEqual(["TR", "TM"]);
    expect(filterOptions("zzz", opts)).toEqual([]);
  });
});

describe("isTurkey", () => {
  it("treats empty and Turkey spellings as Türkiye", () => {
    for (const c of ["", null, undefined, "Türkiye", "Turkey", "TR", "turkiye", "TÜRKİYE", " tr "]) {
      expect(isTurkey(c), String(c)).toBe(true);
    }
    for (const c of ["Almanya", "DE", "Türkmenistan", "Kıbrıs (KKTC)", "Atlantis"]) {
      expect(isTurkey(c), c).toBe(false);
    }
  });
});

describe("locationDefaults (new records only fill empty fields)", () => {
  it("defaults an empty record to Türkiye + İstanbul", () => {
    expect(DEFAULT_COUNTRY).toBe("Türkiye");
    expect(DEFAULT_PROVINCE).toBe("İstanbul");
    expect(locationDefaults({})).toEqual({ country: "Türkiye", city: "İstanbul" });
    expect(locationDefaults({ city: "", district: "", country: "" })).toEqual({ country: "Türkiye", city: "İstanbul" });
    expect(locationDefaults({ city: null, district: null, country: null })).toEqual({ country: "Türkiye", city: "İstanbul" });
    expect(districtsOf(DEFAULT_PROVINCE)).toHaveLength(39);
  });

  it("never overwrites existing values (incl. legacy / not-in-list spellings)", () => {
    expect(locationDefaults({ city: "Ankara", district: "Çankaya", country: "Türkiye" })).toEqual({});
    expect(locationDefaults({ city: "Istambul", country: "Türkiye" })).toEqual({});
    expect(locationDefaults({ city: "Ankara", country: "" })).toEqual({ country: "Türkiye" });
    // İlçe dolu ama il boşsa il uydurulmaz.
    expect(locationDefaults({ district: "Kadıköy" })).toEqual({ country: "Türkiye" });
    expect(locationDefaults({ city: "", country: "TR" })).toEqual({ city: "İstanbul" });
  });

  it("does not default the province outside Türkiye", () => {
    expect(locationDefaults({ country: "Almanya" })).toEqual({});
    expect(locationDefaults({ city: "", country: "DE" })).toEqual({});
  });

  it("withLocationDefaults keeps other fields and existing values", () => {
    const draft = { name: "X", city: "", district: "", country: "" };
    expect(withLocationDefaults(draft)).toEqual({ name: "X", city: "İstanbul", district: "", country: "Türkiye" });
    const existing = { name: "Y", city: "İzmir", district: "", country: "Türkiye" };
    expect(withLocationDefaults(existing)).toEqual(existing);
  });
});

describe("canonicalLocation (eski serbest değerlerin okunurken eşlenmesi)", () => {
  it("il/ilçe/ülke resmî yazıma çevrilir, tanınmayan değer korunur", () => {
    expect(canonicalLocation({ city: "istanbul", district: "kadikoy", country: "TR" })).toEqual({ city: "İstanbul", district: "Kadıköy", country: "Türkiye" });
    expect(canonicalLocation({ city: "Foo", district: "", country: "" })).toEqual({ city: "Foo", district: "", country: "" });
    expect(canonicalLocation({ city: "Berlin", district: "Mitte", country: "germany" })).toEqual({ city: "Berlin", district: "Mitte", country: "Almanya" });
  });
});
