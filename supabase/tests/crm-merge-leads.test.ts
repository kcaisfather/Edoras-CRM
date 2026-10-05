/**
 * 20261005140000_crm_merge_leads — aday birleştirme: taşıma, alan doldurma, kurum bağlantısı, hatalar (PGlite).
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, helpers } from "./harness";

let db: PGlite;
const h = () => helpers(db);
let actor: string;

const uuid = () => crypto.randomUUID();
const inHours = (n: number) => new Date(Date.now() + n * 3600_000).toISOString();

async function lead(cols: Record<string, unknown>): Promise<string> {
  const keys = Object.keys(cols);
  return (
    await h().one<{ id: string }>(
      `insert into crm_leads (${keys.join(", ")}) values (${keys.map((_, i) => `$${i + 1}`).join(", ")}) returning id`,
      Object.values(cols)
    )
  ).id;
}
const merge = (keep: string, drop: string) =>
  h().one<{ r: Record<string, number> }>("select crm_merge_leads($1, $2, $3) as r", [keep, drop, actor]).then((x) => x.r);
const count = async (table: string, col: string, id: string) =>
  (await h().one<{ n: number }>(`select count(*)::int n from ${table} where ${col} = $1`, [id])).n;

beforeAll(async () => {
  db = await createTestDb();
  actor = await h().newUser("admin@x.com");
  await db.query("insert into crm_staff (user_id, role, full_name) values ($1, 'ADMIN', 'A')", [actor]);
}, 60_000);
afterAll(async () => {
  await db.close();
});

describe("crm_merge_leads", () => {
  it("notları, görevleri ve randevuları taşır; silinen aday kalmaz", async () => {
    const keep = await lead({ organization_name: "Ana" });
    const drop = await lead({ organization_name: "Kopya" });
    await db.query("insert into crm_notes (lead_id, content) values ($1, 'a'), ($1, 'b')", [drop]);
    await db.query("insert into crm_tasks (kind, lead_id, due_date, assignment_type) values ('assigned', $1, current_date + 1, 'arama')", [drop]);
    await db.query("insert into crm_appointments (lead_id, starts_at, mode, link) values ($1, $2, 'ONLINE', 'https://a.com')", [drop, inHours(5)]);

    const r = await merge(keep, drop);
    expect(r).toMatchObject({ notes: 2, tasks: 1, appointments: 1 });
    expect(await count("crm_notes", "lead_id", keep)).toBe(2);
    expect(await count("crm_tasks", "lead_id", keep)).toBe(1);
    expect(await count("crm_appointments", "lead_id", keep)).toBe(1);
    expect(await count("crm_leads", "id", drop)).toBe(0);
  });

  it("kural görevlerinin anahtarı yeni adaya göre yazılır; çakışan kopya silinir", async () => {
    const keep = await lead({ organization_name: "Ana2" });
    const drop = await lead({ organization_name: "Kopya2" });
    const day = "2026-10-01";
    const ins = (l: string, d: string) =>
      db.query(
        `insert into crm_tasks (kind, lead_id, due_date, status, task_key, completed_at, completed_by)
         values ('scheduled', $1::uuid, $2::date, 'DONE', 'scheduled:' || $1::text || ':' || $2::text, now(), $3::uuid)`,
        [l, d, actor]
      );
    await ins(keep, day); // çakışacak
    await ins(drop, day);
    await ins(drop, "2026-10-02"); // taşınacak
    const r = await merge(keep, drop);
    expect(r.tasksDropped).toBe(1);
    const keys = (await db.query<{ task_key: string }>("select task_key from crm_tasks where lead_id = $1 order by task_key", [keep])).rows.map((x) => x.task_key);
    expect(keys).toEqual([`scheduled:${keep}:2026-10-01`, `scheduled:${keep}:2026-10-02`]);
  });

  it("boş alanlar doldurulur, dolu alanlar ve statü ana adayda kalır", async () => {
    const keep = await lead({ organization_name: "Ana3", status: "TAKIPTE", city: "Ankara", owner_id: null });
    const drop = await lead({
      organization_name: "Kopya3",
      status: "ARANACAK",
      city: "İzmir",
      district: "Konak",
      contact_email: "a@b.com",
      contact_phone: "+905551112233",
      offer_amount: 100,
      owner_id: actor,
    });
    await merge(keep, drop);
    const r = await h().one<Record<string, unknown>>(
      "select organization_name, status, city, district, contact_email, contact_phone, offer_amount::int offer, owner_id, updated_by from crm_leads where id=$1",
      [keep]
    );
    expect(r).toMatchObject({
      organization_name: "Ana3",
      status: "TAKIPTE",
      city: "Ankara",
      district: "Konak",
      contact_email: "a@b.com",
      contact_phone: "+905551112233",
      offer: 100,
      owner_id: actor,
      updated_by: actor,
    });
  });

  it("yalnız silinen aday kuruma bağlıysa bağlantı ana adaya geçer", async () => {
    const inst = uuid();
    const keep = await lead({ organization_name: "Ana4" });
    const drop = await lead({ organization_name: "Kopya4", institution_id: inst });
    await merge(keep, drop);
    expect((await h().one<{ institution_id: string }>("select institution_id from crm_leads where id=$1", [keep])).institution_id).toBe(inst);
  });

  it("ikisi de bağlıysa reddedilir ve hiçbir şey değişmez", async () => {
    const keep = await lead({ organization_name: "Ana5", institution_id: uuid() });
    const drop = await lead({ organization_name: "Kopya5", institution_id: uuid() });
    await db.query("insert into crm_notes (lead_id, content) values ($1, 'x')", [drop]);
    expect(await h().failure("select crm_merge_leads($1, $2, $3)", [keep, drop, actor])).toContain("CRM_MERGE_BOTH_LINKED");
    expect(await count("crm_leads", "id", drop)).toBe(1);
    expect(await count("crm_notes", "lead_id", drop)).toBe(1);
  });

  it("aynı aday, olmayan aday ve aktörsüz çağrı reddedilir", async () => {
    const a = await lead({ organization_name: "Tek" });
    expect(await h().failure("select crm_merge_leads($1, $1, $2)", [a, actor])).toContain("CRM_MERGE_INVALID");
    expect(await h().failure("select crm_merge_leads($1, $2, $3)", [a, uuid(), actor])).toContain("CRM_MERGE_NOT_FOUND");
    expect(await h().failure("select crm_merge_leads($1, $2, null)", [a, uuid()])).toContain("CRM_MERGE_ACTOR_REQUIRED");
  });

  it("yalnız service_role çalıştırabilir", async () => {
    const r = await h().one<{ anon: boolean; svc: boolean }>(
      "select has_function_privilege('anon', 'crm_merge_leads(uuid,uuid,uuid)', 'execute') anon, has_function_privilege('service_role', 'crm_merge_leads(uuid,uuid,uuid)', 'execute') svc"
    );
    expect(r).toEqual({ anon: false, svc: true });
  });
});
