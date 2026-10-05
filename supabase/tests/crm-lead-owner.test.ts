/**
 * 20261005120000_crm_lead_owner — aday sorumlusu: ekipten olma, ekleme varsayılanı, personel silinince null (PGlite).
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, helpers } from "./harness";

let db: PGlite;
const h = () => helpers(db);

async function staff(email: string, role = "CRM_AGENT"): Promise<string> {
  const id = await h().newUser(email);
  await db.query("insert into crm_staff (user_id, role, full_name) values ($1, $2, 'T')", [id, role]);
  return id;
}
const owner = async (id: string) => (await h().one<{ owner_id: string | null }>("select owner_id from crm_leads where id=$1", [id])).owner_id;
async function lead(extra: Record<string, unknown> = {}): Promise<string> {
  const cols = ["organization_name", ...Object.keys(extra)];
  const row = await h().one<{ id: string }>(
    `insert into crm_leads (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")}) returning id`,
    ["Kurum", ...Object.values(extra)]
  );
  return row.id;
}

beforeAll(async () => {
  db = await createTestDb();
}, 60_000);
afterAll(async () => {
  await db.close();
});

describe("crm_leads.owner_id", () => {
  it("eklemede created_by (ekipten ise) sorumlu olur", async () => {
    const a = await staff("a@x.com");
    expect(await owner(await lead({ created_by: a }))).toBe(a);
  });

  it("açıkça verilen sorumlu korunur", async () => {
    const a = await staff("b@x.com");
    const b = await staff("c@x.com");
    expect(await owner(await lead({ created_by: a, owner_id: b }))).toBe(b);
  });

  it("created_by ekipte değilse sorumlu boş kalır; created_by yoksa da", async () => {
    const outsider = await h().newUser("out@x.com");
    expect(await owner(await lead({ created_by: outsider }))).toBeNull();
    expect(await owner(await lead())).toBeNull();
  });

  it("ekipte olmayan biri sorumlu olamaz (FK)", async () => {
    const outsider = await h().newUser("o2@x.com");
    expect(await h().failure("insert into crm_leads (organization_name, owner_id) values ('K', $1)", [outsider])).toBe(
      "crm_leads_owner_id_fkey"
    );
  });

  it("güncellemede varsayılan devreye girmez; sorumlu null yapılabilir", async () => {
    const a = await staff("d@x.com");
    const id = await lead({ created_by: a });
    await db.query("update crm_leads set owner_id = null where id = $1", [id]);
    expect(await owner(id)).toBeNull();
  });

  it("personel silinince sorumlu null olur", async () => {
    await staff("keep@x.com", "ADMIN"); // son yönetici kuralı
    const a = await staff("e@x.com");
    const id = await lead({ owner_id: a });
    await db.query("delete from crm_staff where user_id = $1", [a]);
    expect(await owner(id)).toBeNull();
  });
});
