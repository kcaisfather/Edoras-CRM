/**
 * 20261005180000_crm_lead_whatsapp — WhatsApp kullanıcı adı kısıtı ve birleştirmede doldurma (PGlite).
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, helpers } from "./harness";

let db: PGlite;
const h = () => helpers(db);

const insert = (username: string | null) =>
  h().failure("insert into crm_leads (organization_name, whatsapp_username) values ('Kurum', $1)", [username]);

beforeAll(async () => {
  db = await createTestDb();
}, 60_000);
afterAll(async () => {
  await db.close();
});

describe("crm_leads.whatsapp_username", () => {
  it("geçerli kullanıcı adlarını ve boşu kabul eder", async () => {
    for (const v of [null, "ayse.yilmaz", "kurum_2026", "abc"]) expect(await insert(v)).toBeNull();
  });

  it("büyük harf, @, boşluk, kısa / uzun ya da harfsiz adı reddeder", async () => {
    for (const v of ["Ayse", "@ayse", "ay se", "ab", "a".repeat(36), "123_45", "ayşe"]) {
      expect(await insert(v)).toBe("crm_leads_whatsapp_username_check");
    }
  });

  it("birleştirmede tutulan adayda boşsa silinenin kullanıcı adı alınır", async () => {
    const actor = await h().newUser("admin@x.com");
    await db.query("insert into crm_staff (user_id, role, full_name) values ($1, 'ADMIN', 'A')", [actor]);
    const id = async (username: string | null) =>
      (await h().one<{ id: string }>("insert into crm_leads (organization_name, whatsapp_username) values ('K', $1) returning id", [username])).id;
    const keep = await id(null);
    const drop = await id("kopya.kurum");
    await db.query("select crm_merge_leads($1, $2, $3)", [keep, drop, actor]);
    expect((await h().one<{ w: string }>("select whatsapp_username w from crm_leads where id = $1", [keep])).w).toBe("kopya.kurum");
  });
});
