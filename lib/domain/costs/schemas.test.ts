import { describe, expect, it } from "vitest";
import {
  costBudgetInputSchema,
  costEntriesQuerySchema,
  costEntryInputSchema,
  costSettingsSchema,
  parseDecimal,
} from "./schemas";
import {
  costEntryKey,
  detectCostColumns,
  parseCostCurrency,
  parseCostMonth,
  parseCostService,
  rowsFromCostTable,
} from "./import";

describe("parseDecimal", () => {
  it("Türkçe ve İngilizce biçimler", () => {
    expect(parseDecimal("1.250,50", 2)).toBe(1250.5);
    expect(parseDecimal("1,250.50", 2)).toBe(1250.5);
    expect(parseDecimal("41,3333", 4)).toBe(41.3333);
    expect(parseDecimal("41.3333", 4)).toBe(41.3333);
    expect(parseDecimal("1.250.000", 2)).toBe(1250000);
    expect(parseDecimal("₺ 25 TL", 2)).toBe(25);
  });
  it("hane sayısı aşılırsa ya da geçersizse null", () => {
    expect(parseDecimal("41,33333", 4)).toBeNull();
    expect(parseDecimal("12,345", 2)).toBeNull();
    expect(parseDecimal("abc", 2)).toBeNull();
    expect(parseDecimal("", 2)).toBeNull();
    expect(parseDecimal("-5", 2)).toBeNull();
  });
});

describe("costEntryInputSchema", () => {
  const ok = { service: "SMS", month: "2026-09", amount: 100, currency: "TRY", note: "  x " };
  it("geçerli TL satırı; not kırpılır", () => {
    const r = costEntryInputSchema.parse(ok);
    expect(r.note).toBe("x");
    expect(r.fxRate ?? null).toBeNull();
  });
  it("USD kur ister, TL kur kabul etmez", () => {
    expect(costEntryInputSchema.safeParse({ ...ok, currency: "USD" }).success).toBe(false);
    expect(costEntryInputSchema.safeParse({ ...ok, currency: "USD", fxRate: 41.5 }).success).toBe(true);
    expect(costEntryInputSchema.safeParse({ ...ok, fxRate: 41.5 }).success).toBe(false);
  });
  it("tutar > 0, en çok 2 hane; ay biçimi; hizmet listede", () => {
    expect(costEntryInputSchema.safeParse({ ...ok, amount: 0 }).success).toBe(false);
    expect(costEntryInputSchema.safeParse({ ...ok, amount: 1.234 }).success).toBe(false);
    expect(costEntryInputSchema.safeParse({ ...ok, month: "2026-13" }).success).toBe(false);
    expect(costEntryInputSchema.safeParse({ ...ok, month: "2026-09-01" }).success).toBe(false);
    expect(costEntryInputSchema.safeParse({ ...ok, service: "AWS" }).success).toBe(false);
  });
});

describe("costBudgetInputSchema", () => {
  it("GLOBAL hizmetsiz, SERVICE hizmetli; sert eşik yumuşaktan büyük", () => {
    expect(costBudgetInputSchema.safeParse({ scope: "GLOBAL", monthlyLimitTry: 1000 }).success).toBe(true);
    expect(costBudgetInputSchema.safeParse({ scope: "GLOBAL", service: "SMS", monthlyLimitTry: 1000 }).success).toBe(false);
    expect(costBudgetInputSchema.safeParse({ scope: "SERVICE", monthlyLimitTry: 1000 }).success).toBe(false);
    expect(costBudgetInputSchema.safeParse({ scope: "SERVICE", service: "SMS", monthlyLimitTry: 1000, softPct: 90, hardPct: 90 }).success).toBe(false);
    const r = costBudgetInputSchema.parse({ scope: "SERVICE", service: "SMS", monthlyLimitTry: 1000 });
    expect(r).toMatchObject({ softPct: 80, hardPct: 100, active: true });
  });
});

describe("costSettingsSchema / costEntriesQuerySchema", () => {
  it("SMS birim fiyatı 0 ≤ p < 1000, 4 hane", () => {
    expect(costSettingsSchema.safeParse({ smsUnitPriceTry: 0.0875 }).success).toBe(true);
    expect(costSettingsSchema.safeParse({ smsUnitPriceTry: -1 }).success).toBe(false);
    expect(costSettingsSchema.safeParse({ smsUnitPriceTry: 0.12345 }).success).toBe(false);
  });
  it("liste süzgeci: bozuk değerler varsayılana düşer", () => {
    expect(costEntriesQuerySchema.parse({ page: "x", size: "9999", service: "AWS", from: "abc" })).toEqual({ page: 0, size: 20 });
    expect(costEntriesQuerySchema.parse({ service: "SMS", from: "2026-01", to: "2026-09", page: "2", size: "50" })).toEqual({
      service: "SMS",
      from: "2026-01",
      to: "2026-09",
      page: 2,
      size: 50,
    });
  });
});

describe("CSV içe aktarma", () => {
  it("başlıklar Türkçe karakterden ve harf boyutundan bağımsız eşlenir", () => {
    expect(detectCostColumns(["HİZMET", "Ay", "Tutar", "Para Birimi", "Kur", "Açıklama"])).toEqual({
      service: 0,
      month: 1,
      amount: 2,
      currency: 3,
      fxRate: 4,
      note: 5,
    });
  });
  it("hizmet, ay ve para birimi tanınır", () => {
    expect(parseCostService("Supabase")).toBe("SUPABASE");
    expect(parseCostService("alan adı")).toBe("DOMAIN");
    expect(parseCostService("AWS")).toBeNull();
    expect(parseCostMonth("2026-09")).toBe("2026-09");
    expect(parseCostMonth("2026-09-15")).toBe("2026-09");
    expect(parseCostMonth("09/2026")).toBe("2026-09");
    expect(parseCostMonth("9.2026")).toBe("2026-09");
    expect(parseCostMonth("Eylül 2026")).toBe("2026-09");
    expect(parseCostMonth("2026-13")).toBeNull();
    expect(parseCostCurrency("")).toBe("TRY");
    expect(parseCostCurrency("TL")).toBe("TRY");
    expect(parseCostCurrency("$")).toBe("USD");
    expect(parseCostCurrency("EUR")).toBeNull();
  });
  it("satırlar doğrulanır: hatalı alan işaretlenir, geçerli satır değere döner", () => {
    const cols = detectCostColumns(["Hizmet", "Ay", "Tutar", "Para birimi", "Kur", "Not"]);
    const rows = rowsFromCostTable(
      cols,
      [
        ["Supabase", "2026-09", "25", "USD", "41,50", "Pro"],
        ["SMS", "2026-09", "1.250,50", "TL", "", ""],
        ["AWS", "2026-13", "abc", "EUR", "", ""],
        ["Vercel", "2026-09", "20", "USD", "", ""],
      ],
      [2, 3, 4, 5]
    );
    expect(rows[0].value).toEqual({ service: "SUPABASE", month: "2026-09", amount: 25, currency: "USD", fxRate: 41.5, note: "Pro" });
    expect(rows[1].value).toEqual({ service: "SMS", month: "2026-09", amount: 1250.5, currency: "TRY", fxRate: null, note: null });
    expect(rows[2].issues).toEqual(["service", "month", "amount", "currency"]);
    expect(rows[3].issues).toEqual(["fxRate"]);
    expect(rows[3].rowNumber).toBe(5);
  });
  it("aynı satır aynı anahtarı üretir", () => {
    const a = { service: "SMS", month: "2026-09", amount: 10, currency: "TRY", note: " Fatura " } as const;
    expect(costEntryKey(a)).toBe(costEntryKey({ ...a, note: "fatura" }));
    expect(costEntryKey(a)).not.toBe(costEntryKey({ ...a, amount: 11 }));
  });
});
