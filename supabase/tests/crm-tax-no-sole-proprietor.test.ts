/**
 * 20261005090000_crm_tax_no_sole_proprietor — vergi numarası VKN ya da şahıs şirketinin TCKN'si (PGlite, düzenek harness.ts).
 * Ayrıca kurum adı en az 2 karakter kuralı (crm_institutions.institution_name CHECK) korunur.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isValidVkn, todayIso } from "@/lib/domain/institutions/rules";
import { createTestDb, helpers } from "./harness";

const TCKN = "10000000146";
const ADDRESS = "Atatürk Cad. No: 12, Bakırköy / İstanbul";

function vkn(nine: string): string {
  for (let c = 0; c <= 9; c++) if (isValidVkn(`${nine}${c}`)) return `${nine}${c}`;
  throw new Error("kontrol hanesi bulunamadı");
}

let db: PGlite;
const failure = (sql: string, params: unknown[] = []) => helpers(db).failure(sql, params);

const ENROLL =
  "select public.crm_enroll_institution(gen_random_uuid(), $1, 'UCRETLI', 'Ayşe Yılmaz', '+905321234567', 'ayse@kurum.test', $2, $3, $4, null, $5::date, 45000::numeric, null)";

const enroll = (name: string, tc: string | null, tax: string | null) =>
  failure(ENROLL, [name, ADDRESS, tc, tax, todayIso()]);

beforeAll(async () => {
  db = await createTestDb();
}, 60_000);

afterAll(async () => {
  await db?.close();
});

const goodVkn = vkn("123456789");
const badVkn = `123456789${(Number(goodVkn[9]) + 1) % 10}`;

describe("vergi numarası", () => {
  it("VKN kabul edilir", async () => {
    expect(await enroll("Örnek Kolej A.Ş.", null, goodVkn)).toBeNull();
  });

  it("şahıs şirketinin geçerli TCKN'si vergi numarası olarak kabul edilir", async () => {
    expect(await enroll("Mete Dershanesi", null, TCKN)).toBeNull();
  });

  it("kontrol hanesi tutmayan 10/11 haneli vergi numarası reddedilir", async () => {
    expect(await enroll("Hatalı VKN", null, badVkn)).toBe("crm_institutions_tax_no_check");
    expect(await enroll("Hatalı TCKN", null, "10000000147")).toBe("crm_institutions_tax_no_check");
  });

  it("tc_no yalnız TCKN kabul eder", async () => {
    expect(await enroll("TC alanında VKN", goodVkn, null)).toBe("crm_institutions_tc_no_check");
  });
});

describe("kurum adı", () => {
  it("1 karakterlik kurum adı reddedilir", async () => {
    expect(await enroll("A", TCKN, null)).not.toBeNull();
    expect(await enroll(" A ", TCKN, null)).not.toBeNull();
  });
});
