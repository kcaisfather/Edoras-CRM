/**
 * 20261005150000_crm_renewal_commitments — durum kümesi, not temizliği, kurum başına tek satır (PGlite, harness.ts).
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, helpers } from "./harness";

let db: PGlite;
const h = () => helpers(db);
const inst = () => crypto.randomUUID();

beforeAll(async () => {
  db = await createTestDb();
}, 60_000);
afterAll(async () => {
  await db.close();
});

describe("crm_renewal_commitments", () => {
  it("üç yenileme niyetinden biri kabul edilir, başkası reddedilir", async () => {
    for (const s of ["WILL_RENEW", "UNDECIDED", "WILL_CHURN"]) {
      expect(await h().failure("insert into crm_renewal_commitments (institution_id, cycle_end, status) values ($1, '2026-12-01', $2)", [inst(), s])).toBeNull();
    }
    expect(await h().failure("insert into crm_renewal_commitments (institution_id, cycle_end, status) values ($1, '2026-12-01', 'MAYBE')", [inst()])).toBe(
      "crm_renewal_commitments_status_check"
    );
  });

  it("not boşluktan arındırılır; boş not null olur; en çok 500 karakter", async () => {
    const a = inst();
    await db.query("insert into crm_renewal_commitments (institution_id, cycle_end, status, note) values ($1, '2026-12-01', 'UNDECIDED', '  yönetimle görüşülecek  ')", [a]);
    const b = inst();
    await db.query("insert into crm_renewal_commitments (institution_id, cycle_end, status, note) values ($1, '2026-12-01', 'UNDECIDED', '   ')", [b]);
    const rows = await db.query<{ institution_id: string; note: string | null }>("select institution_id, note from crm_renewal_commitments where institution_id in ($1, $2)", [a, b]);
    const byId = Object.fromEntries(rows.rows.map((r) => [r.institution_id, r.note]));
    expect(byId[a]).toBe("yönetimle görüşülecek");
    expect(byId[b]).toBeNull();
    expect(
      await h().failure("insert into crm_renewal_commitments (institution_id, cycle_end, status, note) values ($1, '2026-12-01', 'UNDECIDED', $2)", [inst(), "x".repeat(501)])
    ).toBe("crm_renewal_commitments_note_check");
  });

  it("kurum başına tek satır; güncellemede updated_at ilerler", async () => {
    const a = inst();
    await db.query("insert into crm_renewal_commitments (institution_id, cycle_end, status) values ($1, '2026-12-01', 'UNDECIDED')", [a]);
    expect(await h().failure("insert into crm_renewal_commitments (institution_id, cycle_end, status) values ($1, '2026-12-01', 'WILL_RENEW')", [a])).toBe(
      "crm_renewal_commitments_pkey"
    );
    await db.query("update crm_renewal_commitments set updated_at = now() - interval '1 day' where institution_id = $1", [a]);
    // Tetikleyici elle verilen updated_at'i de şimdiye çeker (sunucu hep güncel zamanı yazar).
    const r = await h().one<{ fresh: boolean }>("select updated_at > now() - interval '1 minute' as fresh from crm_renewal_commitments where institution_id = $1", [a]);
    expect(r.fresh).toBe(true);
  });

  it("yalnız service_role erişir", async () => {
    const r = await h().one<{ anon: boolean; svc: boolean }>(
      "select has_table_privilege('anon', 'crm_renewal_commitments', 'select') anon, has_table_privilege('service_role', 'crm_renewal_commitments', 'select') svc"
    );
    expect(r).toEqual({ anon: false, svc: true });
  });
});
