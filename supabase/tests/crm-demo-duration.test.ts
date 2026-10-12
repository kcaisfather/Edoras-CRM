/**
 * 20261012120000_crm_demo_duration — demo süresi kurum bazlı (PGlite, düzenek harness.ts).
 * Kurucu kararı 2026-10-12: süre her demoda seçilir (hazır süre yok), açık demonun bitişini sonradan yönetici uzatır
 * ya da kısaltır. Veritabanı yalnız "bitiş dolu ve başlangıçtan sonra" der; hızlı seçimler (14 gün / 1 ay / 3 ay /
 * 1 yıl) panelde hesaplanır (lib/domain/institutions/demo-duration.ts).
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, todayIso } from "@/lib/domain/institutions/rules";
import { DEMO_DURATION_CHOICES, demoEndFor, saleDemoEndDate } from "@/lib/domain/institutions/demo-duration";
import { createTestDb, helpers } from "./harness";

const TCKN = "10000000146";
const ADDRESS = "Atatürk Cad. No: 12, Bakırköy / İstanbul";
const SIGNATURE = "public.crm_enroll_institution(uuid, text, text, text, text, text, text, text, text, date, date, date, numeric, uuid)";
const ENROLL =
  "select public.crm_enroll_institution($1::uuid, $2, $3, 'Ayşe Yılmaz', '+905321234567', 'ayse@kurum.test', $4, $5, null, $6::date, $7::date, $8::date, $9::numeric, null)";

let db: PGlite;
const one = <T,>(sql: string, params: unknown[] = []) => helpers(db).one<T>(sql, params);
const failure = (sql: string, params: unknown[] = []) => helpers(db).failure(sql, params);

let seq = 0;
const newId = async () => (await one<{ id: string }>("select gen_random_uuid() as id")).id;

/** DEMO kaydı; hata varsa mesajı / kısıt adını döndürür. */
async function enrollDemo(start: string | null, end: string | null): Promise<{ id: string; error: string | null }> {
  const id = await newId();
  const error = await failure(ENROLL, [id, `Demo Kurumu ${++seq}`, "DEMO", null, null, start, end, null, null]);
  return { id, error };
}

async function demoDates(id: string) {
  return one<{ status: string; demo_started_at: string | null; demo_ends_at: string | null }>(
    "select status, demo_started_at::text, demo_ends_at::text from crm_institutions where institution_id = $1",
    [id]
  );
}

const setEnd = (id: string, end: string | null) =>
  failure("update crm_institutions set demo_ends_at = $2::date where institution_id = $1", [id, end]);

beforeAll(async () => {
  db = await createTestDb();
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe("demo açarken süre seçilir", () => {
  it("14 günlük demo: bitiş başlangıç + 14 gün", async () => {
    const start = todayIso();
    const { id, error } = await enrollDemo(start, demoEndFor(start, "14d"));
    expect(error).toBeNull();
    expect(await demoDates(id)).toEqual({ status: "DEMO", demo_started_at: start, demo_ends_at: addDays(start, 14) });
  });

  it("hızlı seçimlerin hepsi (14 gün, 1 ay, 3 ay, 1 yıl) ve özel bitiş tarihi kaydedilir", async () => {
    const start = "2026-01-31";
    for (const choice of DEMO_DURATION_CHOICES) {
      const end = demoEndFor(start, choice);
      const { id, error } = await enrollDemo(start, end);
      expect([choice, error]).toEqual([choice, null]);
      expect((await demoDates(id)).demo_ends_at).toBe(end);
    }
    const custom = await enrollDemo("2026-10-12", "2026-12-31");
    expect(custom.error).toBeNull();
    expect((await demoDates(custom.id)).demo_ends_at).toBe("2026-12-31");
  });

  it("bitiş zorunlu: hazır / varsayılan süre yok", async () => {
    const { id, error } = await enrollDemo(todayIso(), null);
    expect(error).toMatch(/CRM_DEMO_END_REQUIRED/);
    const n = await one<{ n: number }>("select count(*)::int as n from crm_institutions where institution_id = $1", [id]);
    expect(n.n).toBe(0);
  });

  it("başlangıç zorunlu (bitiş verilse de)", async () => {
    expect((await enrollDemo(null, "2026-12-31")).error).toMatch(/CRM_DEMO_START_REQUIRED/);
  });

  it("bitiş başlangıçtan sonra olmalı: aynı gün ya da önce reddedilir, en kısa demo 1 gün", async () => {
    const start = "2026-10-12";
    expect((await enrollDemo(start, start)).error).toBe("crm_institutions_demo_dates_check");
    expect((await enrollDemo(start, "2026-10-01")).error).toBe("crm_institutions_demo_dates_check");
    expect((await enrollDemo(start, "2026-10-13")).error).toBeNull();
  });

  it("geçmiş başlangıçlı (CRM öncesi) demo bugünden önce bitmiş olabilir", async () => {
    expect((await enrollDemo("2025-09-15", "2026-09-15")).error).toBeNull();
  });
});

describe("açık demonun bitişi sonradan değişir (sunucuda yalnız ADMIN)", () => {
  it("uzatılır ve kısaltılır; bitiş başlangıçtan sonra kalmalı", async () => {
    const start = "2026-10-01";
    const { id } = await enrollDemo(start, "2026-10-15");

    expect(await setEnd(id, "2027-01-15")).toBeNull();
    expect((await demoDates(id)).demo_ends_at).toBe("2027-01-15");

    // Kısaltma: bugünden önceye bile (demo hemen bitmiş sayılır) — yalnız başlangıçtan sonra olmalı.
    expect(await setEnd(id, "2026-10-02")).toBeNull();
    expect((await demoDates(id)).demo_ends_at).toBe("2026-10-02");

    expect(await setEnd(id, start)).toBe("crm_institutions_demo_dates_check");
    expect(await setEnd(id, "2026-09-30")).toBe("crm_institutions_demo_dates_check");
    expect(await setEnd(id, null)).toBe("crm_institutions_demo_dates_check");
    expect((await demoDates(id)).demo_ends_at).toBe("2026-10-02");
  });

  it("ücretliye geçen kurumun demo tarihleri geçmiş olarak kalır", async () => {
    const start = todayIso();
    const { id } = await enrollDemo(start, demoEndFor(start, "1m"));
    await db.query("select public.crm_convert_to_paid($1, $2, $3, null, $4::date, 45000, null, null, null, null)", [id, ADDRESS, TCKN, start]);
    expect(await demoDates(id)).toEqual({ status: "UCRETLI", demo_started_at: start, demo_ends_at: demoEndFor(start, "1m") });
  });
});

describe("satışla hesap açma ve ücretli kayıt", () => {
  it("satış yolu: 1 günlük teknik demo kaydı aynı işlemde ücretliye geçer", async () => {
    const start = todayIso();
    const { id, error } = await enrollDemo(start, saleDemoEndDate(start));
    expect(error).toBeNull();
    await db.query("select public.crm_convert_to_paid($1, $2, $3, null, $4::date, 45000, null, null, null, null)", [id, ADDRESS, TCKN, start]);
    expect((await demoDates(id)).status).toBe("UCRETLI");
  });

  it("UCRETLI kayıtta demo tarihleri yazılmaz; lisans yine 1 yıl", async () => {
    const id = await newId();
    await db.query(ENROLL, [id, "Ücretli Kolej", "UCRETLI", ADDRESS, TCKN, "2026-10-01", "2026-11-01", "2026-10-01", 45000]);
    expect(await demoDates(id)).toEqual({ status: "UCRETLI", demo_started_at: null, demo_ends_at: null });
    const lic = await one<{ ends_on: string }>("select ends_on::text from crm_licenses where institution_id = $1", [id]);
    expect(lic.ends_on).toBe("2027-10-01");
  });
});

describe("imza ve yetkiler", () => {
  it("eski 13 parametreli imza kaldırıldı", async () => {
    const n = await one<{ n: number }>("select count(*)::int as n from pg_proc where proname = 'crm_enroll_institution'");
    expect(n.n).toBe(1);
    expect(
      await failure(
        "select public.crm_enroll_institution(gen_random_uuid(), 'Eski Çağrı', 'DEMO', 'Ali Veli', '+905321234567', 'ali@kurs.test', null, null, null, current_date, null::date, null::numeric, null::uuid)"
      )
    ).toMatch(/does not exist/);
  });

  it("yeni imza yalnız service_role'e açık", async () => {
    const can = (role: string) =>
      one<{ ok: boolean }>("select has_function_privilege($1, $2, 'execute') as ok", [role, SIGNATURE]).then((r) => r.ok);
    expect(await can("service_role")).toBe(true);
    for (const role of ["anon", "authenticated"]) expect([role, await can(role)]).toEqual([role, false]);
  });
});
