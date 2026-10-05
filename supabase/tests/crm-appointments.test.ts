/**
 * 20261005130000_crm_appointments — randevu kısıtları: tür/link/yer, geçmiş, atanan, kapanış (PGlite, harness.ts).
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, helpers } from "./harness";

let db: PGlite;
const h = () => helpers(db);
let leadId: string;
let staffId: string;

const inHours = (n: number) => new Date(Date.now() + n * 3600_000).toISOString();

type Row = { starts_at?: string; mode?: string; link?: string | null; location?: string | null; note?: string; assignee_id?: string };

function insertSql(v: Row): { sql: string; params: unknown[] } {
  const row = { lead_id: leadId, starts_at: inHours(24), mode: "ONLINE", link: "https://meet.example.com/x", ...v };
  const cols = Object.keys(row);
  return {
    sql: `insert into crm_appointments (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")}) returning id`,
    params: Object.values(row),
  };
}
async function appt(v: Row = {}): Promise<string> {
  const { sql, params } = insertSql(v);
  return (await h().one<{ id: string }>(sql, params)).id;
}
function fail(v: Row): Promise<string | null> {
  const { sql, params } = insertSql(v);
  return h().failure(sql, params);
}

beforeAll(async () => {
  db = await createTestDb();
  staffId = await h().newUser("s@x.com");
  await db.query("insert into crm_staff (user_id, role, full_name) values ($1, 'ADMIN', 'S')", [staffId]);
  leadId = (await h().one<{ id: string }>("insert into crm_leads (organization_name) values ('K') returning id")).id;
}, 60_000);
afterAll(async () => {
  await db.close();
});

describe("crm_appointments", () => {
  it("online randevu link ile açılır; boşluklar temizlenir", async () => {
    const id = await appt({ link: "  https://meet.example.com/a  ", note: "  not  " });
    const r = await h().one<{ link: string; note: string; status: string }>(
      "select link, note, status from crm_appointments where id=$1",
      [id]
    );
    expect(r).toEqual({ link: "https://meet.example.com/a", note: "not", status: "SCHEDULED" });
  });

  it("online randevuda yer, yüz yüzede link olamaz", async () => {
    expect(await fail({ location: "Ankara" })).toBe("crm_appointments_where_check");
    expect(await fail({ mode: "IN_PERSON" })).toBe("crm_appointments_where_check");
    expect(await fail({ mode: "IN_PERSON", link: null, location: "Ankara" })).toBeNull();
  });

  it("link http/https olmalı", async () => {
    expect(await fail({ link: "ftp://x.com/a" })).toBe("crm_appointments_link_check");
    expect(await fail({ link: "javascript:alert(1)" })).toBe("crm_appointments_link_check");
  });

  it("geçmişe planlanamaz; geçmiş saate güncellenemez", async () => {
    expect(await fail({ starts_at: inHours(-2) })).toContain("CRM_APPOINTMENT_PAST");
    const id = await appt();
    expect(await h().failure("update crm_appointments set starts_at = $2 where id = $1", [id, inHours(-2)])).toContain(
      "CRM_APPOINTMENT_PAST"
    );
    expect(await h().failure("update crm_appointments set starts_at = $2 where id = $1", [id, inHours(48)])).toBeNull();
  });

  it("atanan aktif personel olmalı", async () => {
    const outsider = await h().newUser("o@x.com");
    expect(await fail({ assignee_id: outsider })).not.toBeNull();
    expect(await fail({ assignee_id: staffId })).toBeNull();
  });

  it("kapanış resolved_at ile birlikte olur; kapanan randevu değişmez", async () => {
    const id = await appt();
    expect(await h().failure("update crm_appointments set status = 'HELD' where id = $1", [id])).toBe(
      "crm_appointments_resolved_check"
    );
    expect(
      await h().failure("update crm_appointments set status = 'HELD', resolved_at = now(), resolved_by = $2 where id = $1", [id, staffId])
    ).toBeNull();
    expect(await h().failure("update crm_appointments set note = 'x' where id = $1", [id])).toContain("CRM_APPOINTMENT_CLOSED");
  });

  it("aday silinince randevuları da silinir", async () => {
    const l = (await h().one<{ id: string }>("insert into crm_leads (organization_name) values ('Sil') returning id")).id;
    await db.query("insert into crm_appointments (lead_id, starts_at, mode, link) values ($1, $2, 'ONLINE', 'https://a.com')", [
      l,
      inHours(3),
    ]);
    await db.query("delete from crm_leads where id = $1", [l]);
    expect((await h().one<{ n: number }>("select count(*)::int n from crm_appointments where lead_id=$1", [l])).n).toBe(0);
  });
});
