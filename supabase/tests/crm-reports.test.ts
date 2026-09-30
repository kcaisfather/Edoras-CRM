/** 20260929230000_crm_reports — rapor abonelikleri ve gönderim kaydı (PGlite, düzenek harness.ts). */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, helpers } from "./harness";

let db: PGlite;
const h = () => helpers(db);
let admin: string;
let agent: string;
let disabled: string;

beforeAll(async () => {
  db = await createTestDb();
  admin = await h().newUser("admin@example.com");
  agent = await h().newUser("agent@example.com");
  disabled = await h().newUser("eski@example.com");
  await db.query("insert into crm_staff (user_id, role, full_name, is_active) values ($1, 'ADMIN', 'Yönetici', true), ($2, 'CRM_AGENT', 'Temsilci', true), ($3, 'CRM_AGENT', 'Eski', false)", [
    admin,
    agent,
    disabled,
  ]);
}, 60_000);

afterAll(async () => {
  await db?.close();
});

const INSERT_SUB =
  "insert into crm_report_subscriptions (name, recipient_ids, frequency, time, weekday, day_of_month, sections, timezone, next_run_at) values ($1, $2::uuid[], $3, $4, $5, $6, $7::text[], $8, now()) returning id";

const ALL = ["todayTasks", "endingDemos", "expiring60", "openOffers", "newSignups", "salesTotal"];

function args(over: Partial<{ name: string; recipients: string[]; frequency: string; time: string; weekday: number | null; day: number | null; sections: string[]; tz: string }> = {}) {
  const o = { name: "Sabah raporu", recipients: [admin], frequency: "DAILY", time: "08:30", weekday: null, day: null, sections: ALL, tz: "Europe/Istanbul", ...over };
  return [o.name, o.recipients, o.frequency, o.time, o.weekday, o.day, o.sections, o.tz];
}

describe("crm_report_subscriptions", () => {
  it("günlük, haftalık ve aylık abonelik açılır", async () => {
    await h().one(INSERT_SUB, args());
    await h().one(INSERT_SUB, args({ frequency: "WEEKLY", weekday: 1, recipients: [admin, agent] }));
    await h().one(INSERT_SUB, args({ frequency: "MONTHLY", day: 28, time: "23:59" }));
    const row = await h().one<{ n: number }>("select count(*)::int as n from crm_report_subscriptions");
    expect(row.n).toBe(3);
  });

  it("saat HH:MM olmalı", async () => {
    for (const time of ["24:00", "12:60", "8:30", "abc", "08:30:00", ""]) {
      expect(await h().failure(INSERT_SUB, args({ time }))).toBe("crm_report_subscriptions_time_check");
    }
    await h().one(INSERT_SUB, args({ time: "00:00" }));
  });

  it("haftalıkta gün 1–7 zorunlu; diğer sıklıkta gün boş olmalı", async () => {
    expect(await h().failure(INSERT_SUB, args({ frequency: "WEEKLY", weekday: null }))).toBe("crm_report_subscriptions_weekday_check");
    expect(await h().failure(INSERT_SUB, args({ frequency: "WEEKLY", weekday: 0 }))).toBe("crm_report_subscriptions_weekday_check");
    expect(await h().failure(INSERT_SUB, args({ frequency: "WEEKLY", weekday: 8 }))).toBe("crm_report_subscriptions_weekday_check");
    expect(await h().failure(INSERT_SUB, args({ frequency: "DAILY", weekday: 3 }))).toBe("crm_report_subscriptions_weekday_check");
    await h().one(INSERT_SUB, args({ frequency: "WEEKLY", weekday: 7 }));
  });

  it("aylıkta ayın günü 1–28 zorunlu; diğer sıklıkta boş olmalı", async () => {
    expect(await h().failure(INSERT_SUB, args({ frequency: "MONTHLY", day: null }))).toBe("crm_report_subscriptions_day_check");
    expect(await h().failure(INSERT_SUB, args({ frequency: "MONTHLY", day: 29 }))).toBe("crm_report_subscriptions_day_check");
    expect(await h().failure(INSERT_SUB, args({ frequency: "MONTHLY", day: 0 }))).toBe("crm_report_subscriptions_day_check");
    expect(await h().failure(INSERT_SUB, args({ frequency: "WEEKLY", weekday: 1, day: 5 }))).toBe("crm_report_subscriptions_day_check");
    expect(await h().failure(INSERT_SUB, args({ frequency: "HOURLY" }))).toBe("crm_report_subscriptions_frequency_check");
  });

  it("bölümler bilinen altı değerden ve en az bir tane olmalı", async () => {
    expect(await h().failure(INSERT_SUB, args({ sections: [] }))).toBe("crm_report_subscriptions_sections_check");
    expect(await h().failure(INSERT_SUB, args({ sections: ["todayTasks", "bogus"] }))).toBe("crm_report_subscriptions_sections_check");
    await h().one(INSERT_SUB, args({ sections: ["salesTotal"] }));
  });

  it("zaman dilimi yalnız Europe/Istanbul; ad 1–100 karakter", async () => {
    expect(await h().failure(INSERT_SUB, args({ tz: "UTC" }))).toBe("crm_report_subscriptions_timezone_check");
    expect(await h().failure(INSERT_SUB, args({ name: "" }))).toBe("crm_report_subscriptions_name_check");
    expect(await h().failure(INSERT_SUB, args({ name: "x".repeat(101) }))).toBe("crm_report_subscriptions_name_check");
    const row = await h().one<{ name: string }>("insert into crm_report_subscriptions (name, recipient_ids, frequency, sections, next_run_at) values ('  Ad  ', $1::uuid[], 'DAILY', $2::text[], now()) returning name", [[admin], ALL]);
    expect(row.name).toBe("Ad");
  });

  it("alıcılar: en az bir, tekrarsız, yalnız aktif CRM personeli", async () => {
    expect(await h().failure(INSERT_SUB, args({ recipients: [] }))).toBe("crm_report_subscriptions_recipients_check");
    expect(await h().failure(INSERT_SUB, args({ recipients: [admin, admin] }))).toMatch(/CRM_REPORT_RECIPIENT_INVALID/);
    expect(await h().failure(INSERT_SUB, args({ recipients: [disabled] }))).toMatch(/CRM_REPORT_RECIPIENT_INVALID/);
    expect(await h().failure(INSERT_SUB, args({ recipients: ["00000000-0000-4000-8000-000000000000"] }))).toMatch(/CRM_REPORT_RECIPIENT_INVALID/);
    expect(await h().failure("insert into crm_report_subscriptions (name, recipient_ids, frequency, sections, next_run_at) values ('x', array[null]::uuid[], 'DAILY', array['todayTasks'], now())")).toBe(
      "crm_report_subscriptions_recipients_check"
    );
  });

  it("alıcılar en çok 50 kişi", async () => {
    const many = Array.from({ length: 51 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    expect(await h().failure(INSERT_SUB, args({ recipients: many }))).toBe("crm_report_subscriptions_recipients_check");
  });

  it("sonradan kapatılan alıcı dağıtıcının güncellemesini engellemez; alıcı listesi değişirse yeniden denetlenir", async () => {
    const other = await h().newUser("gecici@example.com");
    await db.query("insert into crm_staff (user_id, role, is_active) values ($1, 'CRM_AGENT', true)", [other]);
    const sub = await h().one<{ id: string }>(INSERT_SUB, args({ recipients: [admin, other] }));
    await db.query("update crm_staff set is_active = false where user_id = $1", [other]);
    await db.query("update crm_report_subscriptions set last_sent_at = now(), next_run_at = now() + interval '1 day' where id = $1", [sub.id]);
    expect(await h().failure("update crm_report_subscriptions set active = false where id = $1", [sub.id])).toBeNull();
    expect(await h().failure("update crm_report_subscriptions set recipient_ids = $2::uuid[] where id = $1", [sub.id, [admin, other, agent]])).toMatch(/CRM_REPORT_RECIPIENT_INVALID/);
    await db.query("update crm_report_subscriptions set recipient_ids = $2::uuid[] where id = $1", [sub.id, [admin, agent]]);
  });

  it("dağıtıcı talebi: yalnız beklenen sonraki çalışma değeri eşleşirse güncelleme satır döndürür", async () => {
    const sub = await h().one<{ id: string; next_run_at: string }>(
      "insert into crm_report_subscriptions (name, recipient_ids, frequency, sections, next_run_at) values ('c', $1::uuid[], 'DAILY', array['todayTasks'], now() - interval '1 minute') returning id, next_run_at::text as next_run_at",
      [[admin]]
    );
    const claim = "update crm_report_subscriptions set next_run_at = now() + interval '1 day' where id = $1 and active and next_run_at = $2::timestamptz returning id";
    const first = await db.query(claim, [sub.id, sub.next_run_at]);
    const second = await db.query(claim, [sub.id, sub.next_run_at]);
    expect(first.rows).toHaveLength(1);
    expect(second.rows).toHaveLength(0);
  });

  it("updated_at güncellemede yenilenir", async () => {
    const sub = await h().one<{ id: string }>(INSERT_SUB, args());
    await db.query("update crm_report_subscriptions set created_at = now() - interval '1 hour', updated_at = now() - interval '1 hour' where id = $1", [sub.id]);
    await db.query("update crm_report_subscriptions set active = false where id = $1", [sub.id]);
    const row = await h().one<{ fresh: boolean }>("select updated_at > now() - interval '1 minute' as fresh from crm_report_subscriptions where id = $1", [sub.id]);
    expect(row.fresh).toBe(true);
  });

  it("yalnız service_role erişir; RLS açık", async () => {
    for (const table of ["crm_report_subscriptions", "crm_report_runs"]) {
      const grants = await db.query<{ grantee: string }>(
        "select distinct grantee from information_schema.role_table_grants where table_name = $1 and grantee in ('anon','authenticated','service_role','PUBLIC')",
        [table]
      );
      expect(grants.rows.map((r) => r.grantee)).toEqual(["service_role"]);
      const rls = await h().one<{ relrowsecurity: boolean }>("select relrowsecurity from pg_class where relname = $1", [table]);
      expect(rls.relrowsecurity).toBe(true);
    }
  });
});

describe("crm_report_runs", () => {
  const INSERT_RUN = "insert into crm_report_runs (subscription_id, trigger, sent_to_count, status, error) values ($1, $2, $3, $4, $5) returning id";
  let subId: string;

  beforeAll(async () => {
    subId = (await h().one<{ id: string }>(INSERT_SUB, args())).id;
  });

  it("gönderildi, atlandı ve başarısız kayıtları", async () => {
    await h().one(INSERT_RUN, [subId, "CRON", 2, "SENT", null]);
    await h().one(INSERT_RUN, [subId, "MANUAL", 1, "SENT", "failed:1/2"]);
    await h().one(INSERT_RUN, [subId, "CRON", 0, "SKIPPED", "no-recipients"]);
    await h().one(INSERT_RUN, [subId, "CRON", 0, "FAILED", "resend:422"]);
  });

  it("kurallar: durum, tetikleyen, sayı; SENT en az bir alıcı; FAILED hata kodu ister", async () => {
    expect(await h().failure(INSERT_RUN, [subId, "CRON", 0, "OK", null])).toBe("crm_report_runs_status_check");
    expect(await h().failure(INSERT_RUN, [subId, "BOT", 0, "SKIPPED", null])).toBe("crm_report_runs_trigger_check");
    expect(await h().failure(INSERT_RUN, [subId, "CRON", -1, "SKIPPED", null])).toBe("crm_report_runs_count_check");
    expect(await h().failure(INSERT_RUN, [subId, "CRON", 0, "SENT", null])).toBe("crm_report_runs_sent_check");
    expect(await h().failure(INSERT_RUN, [subId, "CRON", 0, "FAILED", null])).toBe("crm_report_runs_error_check");
    expect(await h().failure(INSERT_RUN, [subId, "CRON", 0, "FAILED", "x".repeat(201)])).toBe("crm_report_runs_error_check");
  });

  it("abonelik silinince kayıtları da silinir; olmayan aboneliğe kayıt açılamaz", async () => {
    expect(await h().failure(INSERT_RUN, ["00000000-0000-4000-8000-000000000000", "CRON", 0, "SKIPPED", null])).toBe("crm_report_runs_subscription_id_fkey");
    const sub = await h().one<{ id: string }>(INSERT_SUB, args());
    await h().one(INSERT_RUN, [sub.id, "CRON", 1, "SENT", null]);
    await db.query("delete from crm_report_subscriptions where id = $1", [sub.id]);
    const row = await h().one<{ n: number }>("select count(*)::int as n from crm_report_runs where subscription_id = $1", [sub.id]);
    expect(row.n).toBe(0);
  });
});
