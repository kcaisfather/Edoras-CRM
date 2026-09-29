/** 20260929150000_crm_staff_audit — işlem kaydı, iç kurumlar ve "son yönetici" kuralı. */
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

describe("işlem kaydı", () => {
  it("eklenir; değiştirilemez ve silinemez", async () => {
    const actor = await h().newUser("kayit@edorasapp.ai");
    const row = await h().one<{ id: number }>(
      "insert into crm_audit_logs (actor_id, actor_name, action, entity_type, entity_id, details) values ($1, 'Kayıt', 'DEMO_CREATED', 'institution', 'x', '{\"program\":\"yks\"}') returning id",
      [actor]
    );
    expect(row.id).toBeGreaterThan(0);
    expect(await h().failure("update crm_audit_logs set action = 'X' where id = $1", [row.id])).toMatch(/CRM_AUDIT_APPEND_ONLY/);
    expect(await h().failure("delete from crm_audit_logs where id = $1", [row.id])).toMatch(/CRM_AUDIT_APPEND_ONLY/);
    expect(await h().failure("truncate crm_audit_logs")).toMatch(/CRM_AUDIT_APPEND_ONLY/);
  });

  it("eylem ve tür biçimi denetlenir; details nesne olmalı", async () => {
    expect(await h().failure("insert into crm_audit_logs (action, entity_type) values ('demo created', 'institution')")).toBe(
      "crm_audit_logs_action_check"
    );
    expect(await h().failure("insert into crm_audit_logs (action, entity_type) values ('X', 'Kurum')")).toBe(
      "crm_audit_logs_entity_type_check"
    );
    expect(
      await h().failure("insert into crm_audit_logs (action, entity_type, details) values ('X', 'institution', '[1]')")
    ).toBe("crm_audit_logs_details_check");
  });

  it("anon ve authenticated okuyamaz", async () => {
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      const err = await h().failure("select * from crm_audit_logs");
      await db.exec("reset role");
      expect(err).toMatch(/permission denied/);
    }
  });
});

describe("ekip: son aktif yönetici korunur", () => {
  it("tek yönetici temsilci yapılamaz, kapatılamaz, silinemez; ikinci yönetici varken yapılabilir", async () => {
    const a = await h().newUser("yonetici1@edorasapp.ai");
    const b = await h().newUser("yonetici2@edorasapp.ai");
    await db.query("insert into crm_staff (user_id, role, full_name) values ($1, 'ADMIN', 'Bir')", [a]);

    expect(await h().failure("update crm_staff set role = 'CRM_AGENT' where user_id = $1", [a])).toMatch(/CRM_LAST_ADMIN/);
    expect(await h().failure("update crm_staff set is_active = false where user_id = $1", [a])).toMatch(/CRM_LAST_ADMIN/);
    expect(await h().failure("delete from crm_staff where user_id = $1", [a])).toMatch(/CRM_LAST_ADMIN/);
    // Ad değişikliği serbest.
    expect(await h().failure("update crm_staff set full_name = 'Bir Yönetici' where user_id = $1", [a])).toBeNull();

    await db.query("insert into crm_staff (user_id, role, full_name) values ($1, 'ADMIN', 'İki')", [b]);
    expect(await h().failure("update crm_staff set role = 'CRM_AGENT' where user_id = $1", [a])).toBeNull();
    // Şimdi tek aktif yönetici b.
    expect(await h().failure("update crm_staff set is_active = false where user_id = $1", [b])).toMatch(/CRM_LAST_ADMIN/);
  });
});

describe("iç kurumlar", () => {
  it("kurum başına tek kayıt", async () => {
    const id = (await h().one<{ id: string }>("select gen_random_uuid() as id")).id;
    await db.query("insert into crm_internal_institutions (institution_id, note) values ($1, 'Sunum')", [id]);
    expect(await h().failure("insert into crm_internal_institutions (institution_id) values ($1)", [id])).toMatch(
      /duplicate|crm_internal_institutions_pkey/
    );
  });
});
