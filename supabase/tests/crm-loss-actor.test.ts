/**
 * 20261005100000_crm_loss_actor — 12'li kayıp nedeni kümesi, kayıp ayrıntısı (lost_note, competitor, recall_at) ve
 * aktör alanları (offer_by, sold_by) (PGlite, düzenek harness.ts).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, helpers, migrationFiles } from "./harness";

let db: PGlite;
const h = () => helpers(db);

const MIGRATION = "20261005100000_crm_loss_actor.sql";
const REASONS = [
  "PRICE",
  "BUDGET_NOT_APPROVED",
  "NOT_USED",
  "SEASON_ENDED",
  "TEAM_DISBANDED",
  "COACH_LEFT_CLUB",
  "COMPETITOR",
  "MISSING_FEATURE_TECH",
  "DISSATISFIED",
  "NOT_DECISION_MAKER",
  "UNREACHABLE",
  "OTHER",
];

async function lead(org: string, extra: Record<string, unknown> = {}): Promise<string> {
  const cols = ["organization_name", ...Object.keys(extra)];
  const row = await h().one<{ id: string }>(
    `insert into crm_leads (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")}) returning id`,
    [org, ...Object.values(extra)]
  );
  return row.id;
}

const row = <T = Record<string, unknown>>(id: string, cols: string) =>
  h().one<T>(`select ${cols} from crm_leads where id = $1`, [id]);

beforeAll(async () => {
  db = await createTestDb();
  // Teklif / satış tutarı ve satışta hesap şartı (20261005170000) bu dosyanın konusu değil: crm-lead-sale-rules.test.ts.
  await db.exec("alter table crm_leads disable trigger crm_leads_sale_rules");
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe("eski kayıp nedenleri 12'li kümeye dönüşür", () => {
  it("migration, eski değerli satırları eşler ve yeni kümeyi zorunlu kılar", async () => {
    // Bu migration'dan ÖNCEKİ şemayı kur, eski değerli satırlar yaz, sonra migration'ı uygula.
    const old = new PGlite();
    await old.exec(`
      create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
      create schema auth; create table auth.users (id uuid primary key default gen_random_uuid(), email text);
    `);
    const dir = fileURLToPath(new URL("../migrations/", import.meta.url));
    for (const f of migrationFiles().filter((f) => f < MIGRATION)) await old.exec(readFileSync(`${dir}${f}`, "utf8"));
    const map: Record<string, string> = {
      FIYAT: "PRICE",
      BUTCE: "BUDGET_NOT_APPROVED",
      RAKIP: "COMPETITOR",
      IHTIYAC_YOK: "NOT_USED",
      ZAMANLAMA: "SEASON_ENDED",
      DIGER: "OTHER",
    };
    for (const k of Object.keys(map)) {
      await old.query("insert into crm_leads (organization_name, status, lost_reason) values ($1, 'OLUMSUZ', $2)", [k, k]);
    }
    await old.query("insert into crm_leads (organization_name, status) values ('Takipte', 'TAKIPTE')");
    await old.exec(readFileSync(`${dir}${MIGRATION}`, "utf8"));
    const res = await old.query<{ organization_name: string; lost_reason: string | null }>(
      "select organization_name, lost_reason from crm_leads order by organization_name"
    );
    for (const r of res.rows) expect(r.lost_reason).toBe(map[r.organization_name] ?? null);
    await old.close();
  }, 60_000);

  it("12 değerin hepsi OLUMSUZ'da kabul edilir; eski değerler ve uydurma reddedilir", async () => {
    for (const r of REASONS) {
      expect(await h().failure("insert into crm_leads (organization_name, status, lost_reason) values ('A', 'OLUMSUZ', $1)", [r])).toBeNull();
    }
    for (const r of ["FIYAT", "RAKIP", "UYDURMA"]) {
      expect(await h().failure("insert into crm_leads (organization_name, status, lost_reason) values ('A', 'OLUMSUZ', $1)", [r])).toBe(
        "crm_leads_lost_reason_check"
      );
    }
    expect(await h().failure("insert into crm_leads (organization_name, lost_reason) values ('A', 'PRICE')")).toBe(
      "crm_leads_lost_reason_check"
    );
  });
});

describe("kayıp ayrıntısı", () => {
  it("yalnız OLUMSUZ'da dolu olabilir; çıkışta temizlenmezse reddedilir", async () => {
    expect(await h().failure("insert into crm_leads (organization_name, lost_note) values ('A', 'not')")).toBe("crm_leads_loss_detail_check");
    expect(await h().failure("insert into crm_leads (organization_name, recall_at) values ('A', '2027-01-10')")).toBe(
      "crm_leads_loss_detail_check"
    );
    const id = await lead("Kayıp", { status: "OLUMSUZ", lost_reason: "PRICE", lost_note: "Pahalı", recall_at: "2027-01-10" });
    expect(await h().failure("update crm_leads set status = 'TAKIPTE', lost_reason = null where id = $1", [id])).toBe(
      "crm_leads_loss_detail_check"
    );
    expect(
      await h().failure("update crm_leads set status = 'TAKIPTE', lost_reason = null, lost_note = null, recall_at = null where id = $1", [id])
    ).toBeNull();
  });

  it("rakip adı yalnız neden COMPETITOR iken; en çok 128 karakter; not 2000", async () => {
    expect(await h().failure("insert into crm_leads (organization_name, status, lost_reason, competitor) values ('A', 'OLUMSUZ', 'PRICE', 'X')")).toBe(
      "crm_leads_competitor_check"
    );
    expect(
      await h().failure("insert into crm_leads (organization_name, status, lost_reason, competitor) values ('A', 'OLUMSUZ', 'COMPETITOR', 'X Okulları')")
    ).toBeNull();
    expect(
      await h().failure("insert into crm_leads (organization_name, status, lost_reason, competitor) values ('A', 'OLUMSUZ', 'COMPETITOR', $1)", [
        "x".repeat(129),
      ])
    ).toBe("crm_leads_loss_length_check");
    expect(await h().failure("insert into crm_leads (organization_name, status, lost_note) values ('A', 'OLUMSUZ', $1)", ["x".repeat(2001)])).toBe(
      "crm_leads_loss_length_check"
    );
  });

  it("boş metin null olur (normalleştirme)", async () => {
    const id = await lead("Boş", { status: "OLUMSUZ", lost_reason: "COMPETITOR", lost_note: "   ", competitor: "  " });
    expect(await row(id, "lost_note, competitor")).toEqual({ lost_note: null, competitor: null });
  });
});

describe("aktör alanları (offer_by, sold_by)", () => {
  it("null olabilir; kullanıcı silinince null'a döner", async () => {
    const user = await h().newUser("silinecek@edorasapp.ai");
    const id = await lead("Aktörlü", { status: "TEKLIF_VERILDI", offer_by: user });
    expect((await row<{ offer_by: string }>(id, "offer_by")).offer_by).toBe(user);
    await db.query("delete from auth.users where id = $1", [user]);
    expect((await row<{ offer_by: string | null }>(id, "offer_by")).offer_by).toBeNull();
    const plain = await lead("Aktörsüz");
    expect(await row(plain, "offer_by, sold_by")).toEqual({ offer_by: null, sold_by: null });
  });

  it("tetikleyici: teklife geçişte updated_by'dan, satışa geçişte sold_by yazılır; offer_by satışta korunur", async () => {
    const a = await h().newUser("a@edorasapp.ai");
    const b = await h().newUser("b@edorasapp.ai");
    const id = await lead("Geçiş");
    await db.query("update crm_leads set status = 'TEKLIF_VERILDI', updated_by = $2 where id = $1", [id, a]);
    expect(await row(id, "offer_by, sold_by")).toEqual({ offer_by: a, sold_by: null });
    await db.query("update crm_leads set status = 'SATIS_OLDU', sold_at = current_date, updated_by = $2 where id = $1", [id, b]);
    expect(await row(id, "offer_by, sold_by")).toEqual({ offer_by: a, sold_by: b });
    // Statü aynı kalan güncelleme kimseyi değiştirmez.
    await db.query("update crm_leads set city = 'Ankara', updated_by = $2 where id = $1", [id, a]);
    expect(await row(id, "offer_by, sold_by")).toEqual({ offer_by: a, sold_by: b });
  });

  it("sunucunun açıkça yazdığı değer korunur; yeniden teklife geçişte offer_by yenilenir", async () => {
    const a = await h().newUser("c@edorasapp.ai");
    const b = await h().newUser("d@edorasapp.ai");
    const id = await lead("Açık yazım");
    await db.query("update crm_leads set status = 'TEKLIF_VERILDI', offer_by = $2, updated_by = $3 where id = $1", [id, a, b]);
    expect((await row<{ offer_by: string }>(id, "offer_by")).offer_by).toBe(a);
    await db.query("update crm_leads set status = 'TAKIPTE', updated_by = $2 where id = $1", [id, b]);
    await db.query("update crm_leads set status = 'TEKLIF_VERILDI', updated_by = $2 where id = $1", [id, b]);
    expect((await row<{ offer_by: string }>(id, "offer_by")).offer_by).toBe(b);
  });

  it("eklemede (INSERT) created_by'dan doldurulur", async () => {
    const a = await h().newUser("e@edorasapp.ai");
    const id = await lead("Doğrudan satış", { status: "SATIS_OLDU", sold_at: "2026-10-01", created_by: a });
    expect(await row(id, "offer_by, sold_by")).toEqual({ offer_by: null, sold_by: a });
  });

  it("SATIS_OLDU'dan çıkınca sold_by temizlenir; satış dışında elle yazılamaz", async () => {
    const a = await h().newUser("f@edorasapp.ai");
    const id = await lead("Satış geri", { status: "SATIS_OLDU", sold_at: "2026-10-01", sold_by: a });
    await db.query("update crm_leads set status = 'TAKIPTE', sold_at = null where id = $1", [id]);
    expect((await row<{ sold_by: string | null }>(id, "sold_by")).sold_by).toBeNull();
    const other = await lead("Satış değil");
    await db.query("update crm_leads set sold_by = $2 where id = $1", [other, a]);
    expect((await row<{ sold_by: string | null }>(other, "sold_by")).sold_by).toBeNull();
  });
});

describe("crm_complete_task: aday yaması", () => {
  async function staffUser(email: string): Promise<string> {
    const id = await h().newUser(email);
    await db.query("insert into crm_staff (user_id, role, full_name, is_active) values ($1, 'CRM_AGENT', $2, true)", [id, email]);
    return id;
  }
  const complete = (leadId: string, actor: string, patch: Record<string, unknown>) =>
    db.query("select crm_complete_task(null, $1, 'offer', $2, null, '2026-10-05', 'tekrar', null, $3::jsonb, $4, 'Temsilci')", [
      `offer:${leadId}:2026-10-05`,
      leadId,
      JSON.stringify(patch),
      actor,
    ]);

  it('"Satış olmadı"dan çıkarken kayıp ayrıntısı temizlenir', async () => {
    const actor = await staffUser("gorev@edorasapp.ai");
    const id = await lead("Görevli", { status: "OLUMSUZ", lost_reason: "COMPETITOR", competitor: "R", lost_note: "n", recall_at: "2027-01-01" });
    await complete(id, actor, { status: "TAKIPTE", lost_reason: null, lost_note: null, competitor: null, recall_at: null });
    expect(await row(id, "status, lost_reason, lost_note, competitor, recall_at")).toEqual({
      status: "TAKIPTE",
      lost_reason: null,
      lost_note: null,
      competitor: null,
      recall_at: null,
    });
  });

  it("tamamlayan kişi teklifi veren / satışı yapan olarak yazılır (tetikleyici); tanımsız anahtar reddedilir", async () => {
    const actor = await staffUser("gorev2@edorasapp.ai");
    const id = await lead("Görevli 2", { status: "TAKIPTE" });
    await complete(id, actor, { status: "TEKLIF_VERILDI", offer_sent_at: "2026-10-05" });
    expect(await row(id, "offer_by, sold_by")).toEqual({ offer_by: actor, sold_by: null });
    const bad = await h().failure("select crm_complete_task(null, $4, 'offer', $1, null, '2026-10-06', 'tekrar', null, $2::jsonb, $3, 'T')", [
      id,
      JSON.stringify({ offer_by: actor }),
      actor,
      `offer:${id}:2026-10-06`,
    ]);
    expect(bad).toMatch(/CRM_TASK_INVALID/);
  });
});

describe("yetkiler", () => {
  it("aktör tetikleyici fonksiyonu PUBLIC'e açık değil; tablo yine yalnız service_role", async () => {
    for (const role of ["anon", "authenticated"]) {
      const r = await h().one<{ ok: boolean }>("select has_function_privilege($1, 'public.crm_leads_actor()', 'execute') as ok", [role]);
      expect(r.ok).toBe(false);
      await db.exec(`set role ${role}`);
      const err = await h().failure("select offer_by from public.crm_leads");
      await db.exec("reset role");
      expect(err).toMatch(/permission denied/);
    }
  });
});
