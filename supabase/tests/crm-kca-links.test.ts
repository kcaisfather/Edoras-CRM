/**
 * 20261014120000_crm_kca_links — Yönetim (KCA Panel) hesap bağı: personel başına tek bağ, KCA hesabı başına tek personel,
 * parmak izi biçimi, personel silinince bağın gitmesi ve yetkiler (PGlite).
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, helpers } from "./harness";

let db: PGlite;
const h = () => helpers(db);
const FP = "a".repeat(64);

async function staff(email: string): Promise<string> {
  const id = await h().newUser(email);
  await db.query("insert into crm_staff (user_id, role, full_name) values ($1, 'ADMIN', 'S')", [id]);
  return id;
}
const link = (staffId: string, kcaUserId: number, fp = FP) =>
  h().failure("insert into crm_kca_links (staff_user_id, kca_user_id, kca_password_fp) values ($1, $2, $3)", [staffId, kcaUserId, fp]);

beforeAll(async () => {
  db = await createTestDb();
}, 60_000);
afterAll(async () => {
  await db.close();
});

describe("crm_kca_links", () => {
  it("bağ yazılır; personel başına tek bağ, KCA hesabı başına tek personel", async () => {
    const a = await staff("a@x.com");
    const b = await staff("b@x.com");
    expect(await link(a, 1)).toBeNull();
    expect(await link(a, 2)).toBe("crm_kca_links_pkey");
    expect(await link(b, 1)).toBe("crm_kca_links_kca_user_key");
    expect(await link(b, 2)).toBeNull();
  });

  it("kca_user_id pozitif; parmak izi 64 haneli küçük harf onaltılık", async () => {
    const s = await staff("c@x.com");
    expect(await link(s, 0)).toBe("crm_kca_links_kca_user_id_check");
    expect(await link(s, 3, "A".repeat(64))).toBe("crm_kca_links_kca_password_fp_check");
    expect(await link(s, 3, "a".repeat(63))).toBe("crm_kca_links_kca_password_fp_check");
    expect(await link(s, 3, "scrypt$abc$def")).toBe("crm_kca_links_kca_password_fp_check");
  });

  it("yalnız CRM personeli bağlanır; personel silinince bağ da gider", async () => {
    const outsider = await h().newUser("disari@x.com");
    expect(await link(outsider, 9)).toBe("crm_kca_links_staff_user_id_fkey");
    const s = await staff("d@x.com");
    expect(await link(s, 10)).toBeNull();
    await db.query("delete from crm_staff where user_id = $1", [s]);
    expect((await h().one<{ n: number }>("select count(*)::int as n from crm_kca_links where staff_user_id = $1", [s])).n).toBe(0);
  });

  it("RLS açık; anon ve authenticated erişemez, service_role erişir", async () => {
    const r = await h().one<{ rls: boolean }>("select relrowsecurity as rls from pg_class where oid = 'public.crm_kca_links'::regclass");
    expect(r.rls).toBe(true);
    for (const role of ["anon", "authenticated"]) {
      const p = await h().one<{ ok: boolean }>("select has_table_privilege($1, 'public.crm_kca_links', 'select') as ok", [role]);
      expect(p.ok, role).toBe(false);
    }
    const s = await h().one<{ ok: boolean }>("select has_table_privilege('service_role', 'public.crm_kca_links', 'select,insert,update,delete') as ok");
    expect(s.ok).toBe(true);
  });
});
