/**
 * 20261005110000_crm_super_admin — tek süper admin, korumalı bayrak/rol/aktiflik (PGlite, düzenek harness.ts).
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, helpers } from "./harness";

let db: PGlite;
const h = () => helpers(db);

async function staff(email: string, role = "ADMIN", extra = ""): Promise<string> {
  const id = await h().newUser(email);
  await db.query(`insert into crm_staff (user_id, role, full_name${extra ? ", " + extra.split("=")[0] : ""}) values ($1, $2, 'T'${extra ? ", " + extra.split("=")[1] : ""})`, [id, role]);
  return id;
}

beforeAll(async () => {
  db = await createTestDb();
}, 60_000);
afterAll(async () => {
  await db.close();
});

describe("crm_staff.is_super", () => {
  it("varsayılan false; ilk süper admin atanabilir", async () => {
    const a = await staff("a@x.com");
    expect((await h().one<{ is_super: boolean }>("select is_super from crm_staff where user_id=$1", [a])).is_super).toBe(false);
    expect(await h().failure("update crm_staff set is_super = true where user_id = $1", [a])).toBeNull();
  });

  it("ikinci süper admin reddedilir (tekil indeks)", async () => {
    const b = await staff("b@x.com");
    expect(await h().failure("update crm_staff set is_super = true where user_id = $1", [b])).toBe("crm_staff_single_super");
  });

  it("CRM_AGENT ya da pasif süper admin olamaz", async () => {
    const agent = await staff("agent@x.com", "CRM_AGENT");
    expect(await h().failure("update crm_staff set is_super = true where user_id = $1", [agent])).toBe("crm_staff_super_admin_check");
  });

  it("süper adminin bayrağı, rolü ve aktifliği değiştirilemez; silinemez", async () => {
    const s = (await h().one<{ user_id: string }>("select user_id from crm_staff where is_super")).user_id;
    await staff("c@x.com"); // başka aktif ADMIN: son-yönetici kuralı devreye girmesin
    expect(await h().failure("update crm_staff set is_super = false where user_id = $1", [s])).toContain("CRM_SUPER_ADMIN_PROTECTED");
    expect(await h().failure("update crm_staff set role = 'CRM_AGENT' where user_id = $1", [s])).not.toBeNull();
    expect(await h().failure("update crm_staff set is_active = false where user_id = $1", [s])).not.toBeNull();
    expect(await h().failure("delete from crm_staff where user_id = $1", [s])).toContain("CRM_SUPER_ADMIN_PROTECTED");
  });

  it("süper olmayan personel eskisi gibi değiştirilebilir", async () => {
    const d = await staff("d@x.com");
    expect(await h().failure("update crm_staff set role = 'CRM_AGENT' where user_id = $1", [d])).toBeNull();
    expect(await h().failure("delete from crm_staff where user_id = $1", [d])).toBeNull();
  });
});
