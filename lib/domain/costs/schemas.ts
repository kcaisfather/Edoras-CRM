/**
 * Maliyet uçlarının girdi şemaları (sunucu) — form da aynı kuralları `parseDecimal` ile uygular. Veritabanı kısıtları
 * (crm_cost_*) bunun son savunmasıdır.
 */
import { z } from "zod";
import { isMonthKey } from "./months";
import { BUDGET_SCOPES, COST_CURRENCIES, COST_SERVICES } from "./types";

const money = (max: number, digits: number) =>
  z
    .number()
    .positive()
    .max(max)
    .refine((n) => Math.abs(n * 10 ** digits - Math.round(n * 10 ** digits)) < 1e-6, "digits");

export const monthSchema = z.string().refine(isMonthKey, "month");

const note = z
  .string()
  .trim()
  .max(500)
  .nullish()
  .transform((v) => (v ? v : null));

const entryFields = {
  service: z.enum(COST_SERVICES),
  month: monthSchema,
  amount: money(999_999_999.99, 2),
  currency: z.enum(COST_CURRENCIES),
  fxRate: money(9999.9999, 4).nullish(),
  note,
};

/** USD ise kur zorunlu; TL ise kur olmaz (yanlış kurla TL satırı yazılmasın). */
function fxRule(v: { currency: "TRY" | "USD"; fxRate?: number | null }, ctx: z.RefinementCtx) {
  if (v.currency === "USD" && v.fxRate == null) ctx.addIssue({ code: "custom", path: ["fxRate"], message: "fxRequired" });
  if (v.currency === "TRY" && v.fxRate != null) ctx.addIssue({ code: "custom", path: ["fxRate"], message: "fxNotAllowed" });
}

export const costEntryInputSchema = z.object(entryFields).superRefine(fxRule);
export type CostEntryInput = z.output<typeof costEntryInputSchema>;

/** Toplu içe aktarma: en çok 500 satır; her satır ayrı doğrulanır (hatalı satır atlanır, kalanlar eklenir). */
export const MAX_COST_IMPORT_ROWS = 500;
export const costImportSchema = z.object({ rows: z.array(z.unknown()).min(1).max(MAX_COST_IMPORT_ROWS) });

export const costBudgetInputSchema = z
  .object({
    scope: z.enum(BUDGET_SCOPES),
    service: z.enum(COST_SERVICES).nullish(),
    monthlyLimitTry: money(999_999_999.99, 2),
    softPct: z.number().int().min(1).max(100).default(80),
    hardPct: z.number().int().min(2).max(200).default(100),
    active: z.boolean().default(true),
    note,
  })
  .superRefine((v, ctx) => {
    if (v.scope === "SERVICE" && !v.service) ctx.addIssue({ code: "custom", path: ["service"], message: "serviceRequired" });
    if (v.scope === "GLOBAL" && v.service) ctx.addIssue({ code: "custom", path: ["service"], message: "serviceNotAllowed" });
    if (v.hardPct <= v.softPct) ctx.addIssue({ code: "custom", path: ["hardPct"], message: "hardAboveSoft" });
  });
export type CostBudgetInput = z.output<typeof costBudgetInputSchema>;

export const costSettingsSchema = z.object({
  smsUnitPriceTry: z
    .number()
    .min(0)
    .lt(1000)
    .refine((n) => Math.abs(n * 10_000 - Math.round(n * 10_000)) < 1e-6, "digits"),
});

/** GET /api/costs/entries süzgeci. */
export const costEntriesQuerySchema = z.object({
  service: z.enum(COST_SERVICES).optional().catch(undefined),
  from: monthSchema.optional().catch(undefined),
  to: monthSchema.optional().catch(undefined),
  page: z.coerce.number().int().min(0).max(100_000).catch(0),
  size: z.coerce.number().int().min(1).max(200).catch(20),
});
export type CostEntriesQuery = z.output<typeof costEntriesQuerySchema>;

/** Yalnız ay parametresi (kurum maliyetleri, SMS tahmini, hizmetler): geçersiz / boş → undefined (sunucu içinde bulunulan ay). */
export const monthQuerySchema = z.object({ month: monthSchema.optional().catch(undefined) });

/** Ekrandaki ondalık girişi ("1.250,50", "41,3333", "41.3333"). Boş / geçersiz → null. */
export function parseDecimal(input: string | null | undefined, maxDigits: number): number | null {
  if (input == null) return null;
  const raw = input.replace(/[\s₺$]/g, "").replace(/(TL|TRY|USD)$/i, "");
  if (raw === "") return null;
  const lastDot = raw.lastIndexOf(".");
  const lastComma = raw.lastIndexOf(",");
  let normalized: string;
  if (lastDot >= 0 && lastComma >= 0) {
    const decimal = lastComma > lastDot ? "," : ".";
    const thousand = decimal === "," ? "." : ",";
    normalized = raw.split(thousand).join("").replace(decimal, ".");
  } else if (lastComma >= 0) {
    normalized = raw.indexOf(",") === lastComma ? raw.replace(",", ".") : raw.split(",").join("");
  } else if (lastDot >= 0 && raw.indexOf(".") !== lastDot) {
    normalized = raw.split(".").join(""); // "1.250.000"
  } else {
    normalized = raw;
  }
  if (!new RegExp(`^\\d+(\\.\\d{1,${maxDigits}})?$`).test(normalized)) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}
