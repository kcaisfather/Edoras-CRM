/** 20260929220000_crm_costs — maliyet defteri, bütçeler ve ayarlar (PGlite, düzenek harness.ts). */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, helpers } from "./harness";

let db: PGlite;
const h = () => helpers(db);

beforeAll(async () => {
  db = await createTestDb();
}, 60_000);

afterAll(async () => {
  await db?.close();
});

const INSERT_ENTRY =
  "insert into crm_cost_entries (service, period_month, amount, currency, fx_rate, note, source) values ($1, $2::date, $3::numeric, $4, $5::numeric, $6, $7) returning id, amount_try::float8 as amount_try, note, source";

describe("crm_cost_entries", () => {
  it("TL satırı: TL karşılığı tutarın kendisi", async () => {
    const row = await h().one<{ amount_try: number; source: string }>(INSERT_ENTRY, ["SMS", "2026-09-01", 1250.5, "TRY", null, null, "MANUAL"]);
    expect(row.amount_try).toBe(1250.5);
    expect(row.source).toBe("MANUAL");
  });

  it("USD satırı: TL karşılığı = tutar × kur (kuruşa yuvarlı)", async () => {
    const row = await h().one<{ amount_try: number }>(INSERT_ENTRY, ["SUPABASE", "2026-09-01", 25, "USD", 41.3333, "Pro plan", "IMPORT"]);
    expect(row.amount_try).toBe(1033.33);
  });

  it("aynı hizmet ve ay için birden çok satır serbest", async () => {
    await h().one(INSERT_ENTRY, ["VERCEL", "2026-08-01", 20, "USD", 40, "Pro", "MANUAL"]);
    await h().one(INSERT_ENTRY, ["VERCEL", "2026-08-01", 5, "USD", 40, "Ek kullanım", "MANUAL"]);
    const rows = await h().one<{ n: number }>("select count(*)::int as n from crm_cost_entries where service = 'VERCEL' and period_month = '2026-08-01'");
    expect(rows.n).toBe(2);
  });

  it("not kırpılır, boşsa null olur", async () => {
    const row = await h().one<{ note: string | null }>(INSERT_ENTRY, ["DOMAIN", "2026-07-01", 300, "TRY", null, "   ", "MANUAL"]);
    expect(row.note).toBeNull();
    const row2 = await h().one<{ note: string | null }>(INSERT_ENTRY, ["DOMAIN", "2026-07-01", 300, "TRY", null, "  edorasapp.ai  ", "MANUAL"]);
    expect(row2.note).toBe("edorasapp.ai");
  });

  it("kurallar: tutar > 0, dönem ayın 1'i, hizmet ve para birimi listede, kur yalnız USD'de", async () => {
    expect(await h().failure(INSERT_ENTRY, ["SMS", "2026-09-01", 0, "TRY", null, null, "MANUAL"])).toBe("crm_cost_entries_amount_check");
    expect(await h().failure(INSERT_ENTRY, ["SMS", "2026-09-01", -5, "TRY", null, null, "MANUAL"])).toBe("crm_cost_entries_amount_check");
    expect(await h().failure(INSERT_ENTRY, ["SMS", "2026-09-15", 5, "TRY", null, null, "MANUAL"])).toBe("crm_cost_entries_period_check");
    expect(await h().failure(INSERT_ENTRY, ["SMS", "2019-12-01", 5, "TRY", null, null, "MANUAL"])).toBe("crm_cost_entries_period_check");
    expect(await h().failure(INSERT_ENTRY, ["AWS", "2026-09-01", 5, "TRY", null, null, "MANUAL"])).toBe("crm_cost_entries_service_check");
    expect(await h().failure(INSERT_ENTRY, ["SMS", "2026-09-01", 5, "EUR", null, null, "MANUAL"])).toBe("crm_cost_entries_currency_check");
    expect(await h().failure(INSERT_ENTRY, ["OPENAI", "2026-09-01", 5, "USD", null, null, "MANUAL"])).toBe("crm_cost_entries_fx_check");
    expect(await h().failure(INSERT_ENTRY, ["OPENAI", "2026-09-01", 5, "USD", 0, null, "MANUAL"])).toBe("crm_cost_entries_fx_check");
    expect(await h().failure(INSERT_ENTRY, ["OPENAI", "2026-09-01", 5, "TRY", 40, null, "MANUAL"])).toBe("crm_cost_entries_fx_check");
    expect(await h().failure(INSERT_ENTRY, ["OPENAI", "2026-09-01", 5, "TRY", null, null, "ELLE"])).toBe("crm_cost_entries_source_check");
  });

  it("TL karşılığı elle yazılamaz (üretilmiş sütun)", async () => {
    expect(await h().failure("insert into crm_cost_entries (service, period_month, amount, currency, amount_try) values ('SMS', '2026-09-01', 5, 'TRY', 99)")).toMatch(
      /amount_try/
    );
  });

  it("güncellemede TL karşılığı yeniden hesaplanır", async () => {
    const created = await h().one<{ id: string }>(INSERT_ENTRY, ["OTHER", "2026-09-01", 10, "USD", 40, null, "MANUAL"]);
    await db.query("update crm_cost_entries set fx_rate = 50 where id = $1", [created.id]);
    const row = await h().one<{ amount_try: number }>("select amount_try::float8 as amount_try from crm_cost_entries where id = $1", [created.id]);
    expect(row.amount_try).toBe(500);
  });

  it("yalnız service_role erişir; RLS açık", async () => {
    const grants = await db.query<{ grantee: string }>(
      "select distinct grantee from information_schema.role_table_grants where table_name = 'crm_cost_entries' and grantee in ('anon','authenticated','service_role','PUBLIC')"
    );
    expect(grants.rows.map((r) => r.grantee)).toEqual(["service_role"]);
    const rls = await h().one<{ relrowsecurity: boolean }>("select relrowsecurity from pg_class where relname = 'crm_cost_entries'");
    expect(rls.relrowsecurity).toBe(true);
  });
});

const INSERT_BUDGET =
  "insert into crm_cost_budgets (scope, service, monthly_limit_try, soft_pct, hard_pct, active) values ($1, $2, $3::numeric, $4, $5, $6) returning id";

describe("crm_cost_budgets", () => {
  it("GLOBAL bütçe hizmetsiz, SERVICE bütçe hizmetli olur", async () => {
    await h().one(INSERT_BUDGET, ["GLOBAL", null, 10000, 80, 100, true]);
    await h().one(INSERT_BUDGET, ["SERVICE", "OPENAI", 2000, 80, 100, true]);
    expect(await h().failure(INSERT_BUDGET, ["GLOBAL", "SMS", 1000, 80, 100, false])).toBe("crm_cost_budgets_service_check");
    expect(await h().failure(INSERT_BUDGET, ["SERVICE", null, 1000, 80, 100, false])).toBe("crm_cost_budgets_service_check");
    expect(await h().failure(INSERT_BUDGET, ["SERVICE", "AWS", 1000, 80, 100, false])).toBe("crm_cost_budgets_service_check");
    expect(await h().failure(INSERT_BUDGET, ["KURUM", null, 1000, 80, 100, false])).toBe("crm_cost_budgets_scope_check");
  });

  it("limit > 0; yumuşak eşik 1–100; sert eşik yumuşaktan büyük ve ≤ 200", async () => {
    expect(await h().failure(INSERT_BUDGET, ["SERVICE", "VERCEL", 0, 80, 100, true])).toBe("crm_cost_budgets_limit_check");
    expect(await h().failure(INSERT_BUDGET, ["SERVICE", "VERCEL", 100, 0, 100, true])).toBe("crm_cost_budgets_soft_check");
    expect(await h().failure(INSERT_BUDGET, ["SERVICE", "VERCEL", 100, 101, 150, true])).toBe("crm_cost_budgets_soft_check");
    expect(await h().failure(INSERT_BUDGET, ["SERVICE", "VERCEL", 100, 80, 80, true])).toBe("crm_cost_budgets_hard_check");
    expect(await h().failure(INSERT_BUDGET, ["SERVICE", "VERCEL", 100, 80, 201, true])).toBe("crm_cost_budgets_hard_check");
    await h().one(INSERT_BUDGET, ["SERVICE", "VERCEL", 100, 80, 150, true]);
  });

  it("kapsam başına tek aktif bütçe; pasif olanlar çoğalabilir", async () => {
    await h().one(INSERT_BUDGET, ["SERVICE", "RESEND", 500, 80, 100, true]);
    expect(await h().failure(INSERT_BUDGET, ["SERVICE", "RESEND", 700, 80, 100, true])).toBe("crm_cost_budgets_active_scope_key");
    await h().one(INSERT_BUDGET, ["SERVICE", "RESEND", 700, 80, 100, false]);
    await h().one(INSERT_BUDGET, ["SERVICE", "RESEND", 900, 80, 100, false]);
    // GLOBAL için de tek aktif.
    expect(await h().failure(INSERT_BUDGET, ["GLOBAL", null, 5000, 80, 100, true])).toBe("crm_cost_budgets_active_scope_key");
  });
});

describe("crm_cost_settings", () => {
  it("tek satır hazır gelir; ikincisi açılamaz; fiyat 0 ≤ p < 1000", async () => {
    const row = await h().one<{ n: number; price: number }>("select count(*)::int as n, max(sms_unit_price_try)::float8 as price from crm_cost_settings");
    expect(row).toEqual({ n: 1, price: 0 });
    expect(await h().failure("insert into crm_cost_settings (id) values (2)")).toBe("crm_cost_settings_singleton_check");
    expect(await h().failure("update crm_cost_settings set sms_unit_price_try = -1")).toBe("crm_cost_settings_sms_price_check");
    await db.query("update crm_cost_settings set sms_unit_price_try = 0.0875 where id = 1");
    const after = await h().one<{ price: number }>("select sms_unit_price_try::float8 as price from crm_cost_settings where id = 1");
    expect(after.price).toBe(0.0875);
  });
});
