/**
 * 20261005160000_crm_tickets — destek talebi kısıtları, çözüm anı, atanan, müşteri (portal) RPC'leri ve sınırları (PGlite).
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, helpers } from "./harness";

let db: PGlite;
const h = () => helpers(db);
let institution: string;
let staffId: string;
let token: string;

const ENROLL =
  "select public.crm_enroll_institution($1::uuid, $2, 'DEMO', 'Ayşe Yılmaz', '+905321234567', 'ayse@kurum.test', null, null, null, current_date, null, null, null)";
const newToken = () => `${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`.slice(0, 48);
const portal = (t: string, over: Partial<Record<"subject" | "description" | "name" | "email" | "phone", string | null>> = {}) => {
  const v = { subject: "Yoklama açılmıyor", description: "Detay", name: "Ali Veli", email: "ali@kurum.test", phone: null, ...over };
  return h().failure("select crm_ticket_portal_create($1, $2, $3, $4, $5, $6)", [t, v.subject, v.description, v.name, v.email, v.phone]);
};
const create = (t: string, over: Parameters<typeof portal>[1] = {}) => {
  const v = { subject: "Yoklama açılmıyor", description: "Detay", name: "Ali Veli", email: "ali@kurum.test", phone: null, ...over };
  return h().one<{ r: { number: number } }>("select crm_ticket_portal_create($1, $2, $3, $4, $5, $6) as r", [t, v.subject, v.description, v.name, v.email, v.phone]);
};

beforeAll(async () => {
  db = await createTestDb();
  institution = crypto.randomUUID();
  await db.query(ENROLL, [institution, "Deneme Koleji"]);
  staffId = await h().newUser("s@x.com");
  await db.query("insert into crm_staff (user_id, role, full_name) values ($1, 'ADMIN', 'S')", [staffId]);
  token = newToken();
  await db.query("insert into crm_ticket_links (institution_id, token) values ($1, $2)", [institution, token]);
}, 60_000);
afterAll(async () => {
  await db.close();
});

describe("crm_tickets (ekip)", () => {
  const insert = (cols: Record<string, unknown>) => {
    const row = { institution_id: institution, subject: "Konu başlığı", ...cols };
    const keys = Object.keys(row);
    return h().failure(`insert into crm_tickets (${keys.join(", ")}) values (${keys.map((_, i) => `$${i + 1}`).join(", ")})`, Object.values(row));
  };

  it("varsayılanlar ve kısıtlar", async () => {
    expect(await insert({})).toBeNull();
    expect(await insert({ subject: "ab" })).toBe("crm_tickets_subject_check");
    expect(await insert({ status: "CLOSED" })).toBe("crm_tickets_status_check");
    expect(await insert({ priority: "URGENT" })).toBe("crm_tickets_priority_check");
    expect(await insert({ requester_email: "bozuk" })).toBe("crm_tickets_email_check");
  });

  it("alanlar temizlenir: konu boşlukları, e-posta küçük harf, boş açıklama null", async () => {
    await insert({ subject: "  Çok   boşluklu   konu ", requester_email: " A@B.COM ", description: "   " });
    const r = await h().one<{ subject: string; requester_email: string; description: string | null }>(
      "select subject, requester_email, description from crm_tickets where subject = 'Çok boşluklu konu'"
    );
    expect(r).toEqual({ subject: "Çok boşluklu konu", requester_email: "a@b.com", description: null });
  });

  it("çözüm anı durumdan türer: RESOLVED'da dolar, çıkınca silinir, tekrar güncellemede değişmez", async () => {
    await insert({ subject: "Çözülecek talep" });
    const id = (await h().one<{ id: string }>("select id from crm_tickets where subject = 'Çözülecek talep'")).id;
    await db.query("update crm_tickets set status = 'RESOLVED' where id = $1", [id]);
    const first = (await h().one<{ resolved_at: string }>("select resolved_at::text from crm_tickets where id = $1", [id])).resolved_at;
    expect(first).not.toBeNull();
    await db.query("update crm_tickets set priority = 'HIGH' where id = $1", [id]);
    expect((await h().one<{ resolved_at: string }>("select resolved_at::text from crm_tickets where id = $1", [id])).resolved_at).toBe(first);
    await db.query("update crm_tickets set status = 'OPEN' where id = $1", [id]);
    expect((await h().one<{ resolved_at: string | null }>("select resolved_at from crm_tickets where id = $1", [id])).resolved_at).toBeNull();
  });

  it("atanan aktif personel olmalı", async () => {
    const outsider = await h().newUser("o@x.com");
    expect(await insert({ assignee_id: outsider })).not.toBeNull();
    expect(await insert({ assignee_id: staffId })).toBeNull();
  });

  it("numara artar ve benzersizdir; not boş olamaz", async () => {
    const nums = (await db.query<{ number: number }>("select number from crm_tickets order by number")).rows.map((x) => Number(x.number));
    expect(new Set(nums).size).toBe(nums.length);
    const id = (await h().one<{ id: string }>("select id from crm_tickets limit 1")).id;
    expect(await h().failure("insert into crm_ticket_notes (ticket_id, body) values ($1, '   ')", [id])).toBe("crm_ticket_notes_body_check");
    expect(await h().failure("insert into crm_ticket_notes (ticket_id, body, author_id) values ($1, 'Arandı', $2)", [id, staffId])).toBeNull();
  });
});

describe("müşteri (portal) RPC'leri", () => {
  it("açılış: geçerli token kurum adını verir; geçersiz / bilinmeyen token NOT_FOUND", async () => {
    const ok = await h().one<{ r: { state: string; institution_name?: string } }>("select crm_ticket_portal_open($1) as r", [token]);
    expect(ok.r).toEqual({ state: "OPEN", institution_name: "Deneme Koleji" });
    for (const t of [newToken(), "kisa", ""]) {
      expect((await h().one<{ r: { state: string } }>("select crm_ticket_portal_open($1) as r", [t])).r.state).toBe("NOT_FOUND");
    }
  });

  it("talep oluşturur (kaynak PORTAL, durum OPEN) ve numara döner", async () => {
    const r = await create(token);
    expect(Number(r.r.number)).toBeGreaterThan(0);
    const row = await h().one<{ source: string; status: string; requester_name: string }>(
      "select source, status, requester_name from crm_tickets where number = $1",
      [r.r.number]
    );
    expect(row).toEqual({ source: "PORTAL", status: "OPEN", requester_name: "Ali Veli" });
  });

  it("geçersiz token, eksik alan ve iletişimsiz talep reddedilir", async () => {
    expect(await portal(newToken())).toContain("CRM_TICKET_LINK_NOT_FOUND");
    expect(await portal(token, { subject: "ab" })).toContain("CRM_TICKET_INVALID");
    expect(await portal(token, { name: "A" })).toContain("CRM_TICKET_INVALID");
    expect(await portal(token, { description: "x".repeat(4001) })).toContain("CRM_TICKET_INVALID");
    expect(await portal(token, { email: null, phone: null })).toContain("CRM_TICKET_CONTACT_REQUIRED");
    expect(await portal(token, { email: null, phone: "+905551112233" })).toBeNull();
  });

  it("kurum başına 24 saatte en çok 20 portal talebi", async () => {
    const t = newToken();
    const inst = crypto.randomUUID();
    await db.query(ENROLL, [inst, "Sınır Koleji"]);
    await db.query("insert into crm_ticket_links (institution_id, token) values ($1, $2)", [inst, t]);
    for (let i = 0; i < 20; i++) expect(await portal(t, { subject: `Talep numara ${i}` })).toBeNull();
    expect(await portal(t)).toContain("CRM_TICKET_RATE_LIMITED");
    // Başka kurumun sınırı etkilenmez.
    expect(await portal(token)).toBeNull();
  });

  it("yalnız service_role çalıştırabilir", async () => {
    const r = await h().one<{ anon: boolean; svc: boolean; tbl: boolean }>(
      `select has_function_privilege('anon', 'crm_ticket_portal_create(text,text,text,text,text,text)', 'execute') anon,
              has_function_privilege('service_role', 'crm_ticket_portal_create(text,text,text,text,text,text)', 'execute') svc,
              has_table_privilege('anon', 'crm_tickets', 'select') tbl`
    );
    expect(r).toEqual({ anon: false, svc: true, tbl: false });
  });
});
