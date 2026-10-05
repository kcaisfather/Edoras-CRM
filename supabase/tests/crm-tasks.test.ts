/** 20260929170000_crm_tasks — görevler, kurallar, tamamlama ve geri alma (PGlite, düzenek harness.ts). */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, helpers } from "./harness";

let db: PGlite;
const h = () => helpers(db);

async function newId(): Promise<string> {
  return (await h().one<{ id: string }>("select gen_random_uuid() as id")).id;
}

async function staff(email: string, role: "ADMIN" | "CRM_AGENT" = "CRM_AGENT", active = true): Promise<string> {
  const id = await h().newUser(email);
  await db.query("insert into crm_staff (user_id, role, full_name, is_active) values ($1, $2, $3, $4)", [id, role, email, active]);
  return id;
}

async function lead(org: string, extra: Record<string, unknown> = {}): Promise<string> {
  const cols = ["organization_name", ...Object.keys(extra)];
  const row = await h().one<{ id: string }>(
    `insert into crm_leads (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")}) returning id`,
    [org, ...Object.values(extra)]
  );
  return row.id;
}

/** Bugünden elle atanan görev (havuz ya da atanmış). */
async function assigned(leadId: string, assignee: string | null = null): Promise<string> {
  const row = await h().one<{ id: string }>(
    "insert into crm_tasks (kind, lead_id, due_date, assignment_type, assignee_id, note) values ('assigned', $1, crm_today(), 'arama', $2, 'Ara') returning id",
    [leadId, assignee]
  );
  return row.id;
}

interface CompleteArgs {
  taskId?: string | null;
  key?: string | null;
  kind?: string | null;
  leadId?: string | null;
  institutionId?: string | null;
  due?: string | null;
  outcome?: string | null;
  note?: string | null;
  patch?: Record<string, unknown> | null;
  actor: string | null;
  actorName?: string;
}

/** crm_complete_task'ı sunucunun rolüyle (service_role) çağırır: yetkiler de sınanır. */
async function complete(a: CompleteArgs): Promise<string> {
  await db.exec("set role service_role");
  try {
    const row = await h().one<{ id: string }>(
      "select crm_complete_task($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) as id",
      [
        a.taskId ?? null,
        a.key ?? null,
        a.kind ?? null,
        a.leadId ?? null,
        a.institutionId ?? null,
        a.due ?? null,
        a.outcome ?? null,
        a.note ?? null,
        a.patch ? JSON.stringify(a.patch) : null,
        a.actor,
        a.actorName ?? "Temsilci",
      ]
    );
    return row.id;
  } finally {
    await db.exec("reset role");
  }
}

async function completeFailure(a: CompleteArgs): Promise<string | null> {
  try {
    await complete(a);
    return null;
  } catch (err) {
    const e = err as { message?: string; constraint?: string };
    return e.constraint ?? e.message ?? String(err);
  }
}

async function reopen(taskId: string, actor: string): Promise<string | null> {
  await db.exec("set role service_role");
  try {
    return await h().failure("select crm_reopen_task($1, $2)", [taskId, actor]);
  } finally {
    await db.exec("reset role");
  }
}

const count = async (sql: string, params: unknown[] = []) => (await h().one<{ n: number }>(`select count(*)::int as n ${sql}`, params)).n;

let admin: string;
let agentA: string;
let agentB: string;

beforeAll(async () => {
  db = await createTestDb();
  admin = await staff("yonetici@edorasapp.ai", "ADMIN");
  agentA = await staff("a@edorasapp.ai");
  agentB = await staff("b@edorasapp.ai");
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe("kurulum", () => {
  it("görev ve kural tabloları anon ve authenticated rollerine kapalı", async () => {
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      const tasks = await h().failure("select * from public.crm_tasks");
      const rules = await h().failure("select * from public.crm_rules");
      await db.exec("reset role");
      expect(tasks).toMatch(/permission denied/);
      expect(rules).toMatch(/permission denied/);
    }
  });

  it("fonksiyonlar PUBLIC'e açık değil", async () => {
    const fns = [
      "public.crm_complete_task(uuid, text, text, uuid, uuid, date, text, text, jsonb, uuid, text)",
      "public.crm_reopen_task(uuid, uuid)",
      "public.crm_is_admin(uuid)",
      "public.crm_tasks_guard()",
    ];
    for (const role of ["anon", "authenticated"]) {
      for (const fn of fns) {
        const row = await h().one<{ ok: boolean }>("select has_function_privilege($1, $2, 'execute') as ok", [role, fn]);
        expect(row.ok, `${role} → ${fn}`).toBe(false);
      }
    }
  });

  it("Edoras varsayılan kuralları yazılı (quotaHigh / demoShort / demoLong yok)", async () => {
    const rows = (await db.query<{ id: string; enabled: boolean; days: number }>("select id, enabled, days from crm_rules order by id")).rows;
    expect(Object.fromEntries(rows.map((r) => [r.id, r.days]))).toEqual({
      annualRenewal: 60,
      balance: 7,
      coldList: 2,
      demoEnding: 30,
      expired: 0,
      lostRecontact: 90,
      offer: 3,
      scheduled: 0,
      surveyNoResponse: 5,
      undatedFollowUp: 0,
    });
    expect(rows.every((r) => r.enabled)).toBe(true);
  });
});

describe("crm_rules", () => {
  it.each([
    ["update crm_rules set days = 366 where id = 'offer'", "crm_rules_days_check"],
    ["update crm_rules set days = -1 where id = 'offer'", "crm_rules_days_check"],
    ["update crm_rules set days = 2 where id = 'scheduled'", "crm_rules_scheduled_check"],
    ["insert into crm_rules (id, days) values ('quotaHigh', 90)", "crm_rules_id_check"],
  ])("%s reddedilir", async (sql, constraint) => {
    expect(await h().failure(sql)).toBe(constraint);
  });

  it("güncellemede updated_at ilerler ve güncelleyen yazılır", async () => {
    await db.query("update crm_rules set updated_at = now() - interval '1 day' where id = 'balance'");
    await db.query("update crm_rules set days = 10, updated_by = $1 where id = 'balance'", [admin]);
    const row = await h().one<{ days: number; fresh: boolean; updated_by: string }>(
      "select days, updated_at > now() - interval '1 minute' as fresh, updated_by from crm_rules where id = 'balance'"
    );
    expect(row).toEqual({ days: 10, fresh: true, updated_by: admin });
    await db.query("update crm_rules set days = 7 where id = 'balance'");
  });
});

describe("crm_tasks kuralları", () => {
  it("elle atanan görev: amaç zorunlu, geçmiş güne atanamaz, boş not null olur", async () => {
    const l = await lead("Atama Kurumu");
    expect(await h().failure("insert into crm_tasks (kind, lead_id, due_date) values ('assigned', $1, crm_today())", [l])).toBe(
      "crm_tasks_assigned_fields_check"
    );
    expect(
      await h().failure(
        "insert into crm_tasks (kind, lead_id, due_date, assignment_type) values ('assigned', $1, crm_today(), 'toplanti')",
        [l]
      )
    ).toBe("crm_tasks_assignment_type_check");
    expect(
      await h().failure(
        "insert into crm_tasks (kind, lead_id, due_date, assignment_type) values ('assigned', $1, crm_today() - 5, 'arama')",
        [l]
      )
    ).toBe("CRM_TASK_PAST_DUE");
    const row = await h().one<{ note: string | null; status: string }>(
      "insert into crm_tasks (kind, lead_id, due_date, assignment_type, note) values ('assigned', $1, crm_today() + 3, 'teklif', '   ') returning note, status",
      [l]
    );
    expect(row).toEqual({ note: null, status: "OPEN" });
    expect(
      await h().failure(
        "insert into crm_tasks (kind, lead_id, due_date, assignment_type, note) values ('assigned', $1, crm_today(), 'arama', $2)",
        [l, "x".repeat(2001)]
      )
    ).toBe("crm_tasks_note_check");
  });

  it("atanan kişi aktif CRM personeli olmalı", async () => {
    const l = await lead("Personel Kurumu");
    const passive = await staff("pasif@edorasapp.ai", "CRM_AGENT", false);
    const outsider = await h().newUser("disari@edorasapp.ai");
    for (const who of [passive, outsider]) {
      expect(
        await h().failure(
          "insert into crm_tasks (kind, lead_id, due_date, assignment_type, assignee_id) values ('assigned', $1, crm_today(), 'arama', $2)",
          [l, who]
        )
      ).toBe("CRM_TASK_ASSIGNEE_INVALID");
    }
    const id = await assigned(l, agentA);
    expect(await h().failure("update crm_tasks set assignee_id = $1 where id = $2", [passive, id])).toBe("CRM_TASK_ASSIGNEE_INVALID");
    expect(await h().failure("update crm_tasks set assignee_id = $1 where id = $2", [agentB, id])).toBeNull();
  });

  it("kural görevi yalnız DONE saklanır; anahtar tür + özne + vadeyle tutarlı", async () => {
    const l = await lead("Kural Kurumu");
    const key = `offer:${l}:2026-09-25`;
    expect(
      await h().failure("insert into crm_tasks (kind, lead_id, due_date, task_key) values ('offer', $1, '2026-09-25', $2)", [l, key])
    ).toBe("crm_tasks_rule_done_check");
    const done = "insert into crm_tasks (kind, lead_id, due_date, status, task_key, completed_at) values ('offer', $1, $2, 'DONE', $3, now())";
    expect(await h().failure(done, [l, "2026-09-26", key])).toBe("crm_tasks_key_check");
    expect(await h().failure(done, [l, "2026-09-25", `balance:${l}:2026-09-25`])).toBe("crm_tasks_key_check");
    expect(await h().failure(done, [l, "2026-09-25", null])).toBe("crm_tasks_key_check");
    expect(await h().failure(done, [l, "2026-09-25", key])).toBeNull();
    expect(await h().failure(done, [l, "2026-09-25", key])).toMatch(/crm_tasks_task_key_key|duplicate/);
    // Elle atanan görevde anahtar olmaz; kural görevinde amaç / atanan kişi olmaz.
    expect(
      await h().failure(
        "insert into crm_tasks (kind, lead_id, due_date, assignment_type, task_key) values ('assigned', $1, crm_today(), 'arama', 'x')",
        [l]
      )
    ).toBe("crm_tasks_key_check");
    expect(
      await h().failure(
        "insert into crm_tasks (kind, lead_id, due_date, status, task_key, completed_at, assignment_type) values ('offer', $1, '2026-09-24', 'DONE', $2, now(), 'arama')",
        [l, `offer:${l}:2026-09-24`]
      )
    ).toBe("crm_tasks_assigned_fields_check");
  });

  it("özne: kurum kuralları kuruma, diğerleri adaya bağlı", async () => {
    const l = await lead("Özne Kurumu");
    const inst = await newId();
    const done = "insert into crm_tasks (kind, lead_id, institution_id, due_date, status, task_key, completed_at) values ($1, $2, $3, '2026-10-01', 'DONE', $4, now())";
    expect(await h().failure(done, ["demoEnding", l, null, `demoEnding:${l}:2026-10-01`])).toBe("crm_tasks_subject_check");
    expect(await h().failure(done, ["demoEnding", l, inst, `demoEnding:${l}:2026-10-01`])).toBe("crm_tasks_subject_check");
    expect(await h().failure(done, ["balance", null, inst, `balance:${inst}:2026-10-01`])).toBe("crm_tasks_subject_check");
    // Öznesiz satırda anahtar da kurulamaz; hangisi önce denetlenirse o kısıt döner.
    expect(await h().failure(done, ["expired", null, null, "expired::2026-10-01"])).toMatch(/^crm_tasks_(subject|key)_check$/);
    expect(await h().failure(done, ["demoEnding", null, inst, `demoEnding:${inst}:2026-10-01`])).toBeNull();
  });

  it("DONE ⇔ tamamlanma anı; sonuç yalnız DONE'da", async () => {
    const l = await lead("Sonuç Kurumu");
    expect(
      await h().failure(
        "insert into crm_tasks (kind, lead_id, due_date, status, task_key) values ('offer', $1, '2026-09-20', 'DONE', $2)",
        [l, `offer:${l}:2026-09-20`]
      )
    ).toBe("crm_tasks_done_check");
    expect(
      await h().failure(
        "insert into crm_tasks (kind, lead_id, due_date, assignment_type, outcome) values ('assigned', $1, crm_today(), 'arama', 'ulasildi')",
        [l]
      )
    ).toBe("crm_tasks_done_check");
    expect(
      await h().failure(
        "insert into crm_tasks (kind, lead_id, due_date, status, task_key, completed_at, outcome) values ('offer', $1, '2026-09-20', 'DONE', $2, now(), 'bilinmiyor')",
        [l, `offer:${l}:2026-09-20`]
      )
    ).toBe("crm_tasks_outcome_check");
  });

  it("aday silinince görevleri de silinir", async () => {
    const l = await lead("Silinen Kurum");
    await assigned(l);
    await complete({ key: `offer:${l}:2026-09-25`, kind: "offer", leadId: l, due: "2026-09-25", outcome: "ulasildi", actor: agentA });
    expect(await count("from crm_tasks where lead_id = $1", [l])).toBe(2);
    await db.query("delete from crm_leads where id = $1", [l]);
    expect(await count("from crm_tasks where lead_id = $1", [l])).toBe(0);
  });
});

describe("crm_complete_task — kural görevi", () => {
  it("tek işlemde: DONE satırı + aday notu + statü ve sonraki arama", async () => {
    const l = await lead("Teklif Kurumu", { status: "TEKLIF_VERILDI", offer_sent_at: "2026-09-22" });
    const key = `offer:${l}:2026-09-25`;
    const id = await complete({
      key,
      kind: "offer",
      leadId: l,
      due: "2026-09-25",
      outcome: "tekrar",
      note: "Görev: Teklif takibi — Sonuç: Tekrar aranacak\nFiyatı düşünüyor",
      patch: { status: "TAKIPTE", next_follow_up_at: "2026-10-05", lost_reason: null },
      actor: agentA,
      actorName: "Ayşe Temsilci",
    });
    const task = await h().one<Record<string, unknown>>(
      "select kind, lead_id, institution_id, status, task_key, outcome, result_note, completed_by, created_by, completed_at is not null as done from crm_tasks where id = $1",
      [id]
    );
    expect(task).toMatchObject({
      kind: "offer",
      lead_id: l,
      institution_id: null,
      status: "DONE",
      task_key: key,
      outcome: "tekrar",
      completed_by: agentA,
      created_by: agentA,
      done: true,
    });
    expect(task.result_note).toMatch(/Fiyatı düşünüyor/);
    const note = await h().one<{ author_id: string; author_name: string; content: string }>(
      "select author_id, author_name, content from crm_notes where lead_id = $1",
      [l]
    );
    expect(note).toMatchObject({ author_id: agentA, author_name: "Ayşe Temsilci" });
    expect(note.content).toMatch(/^Görev: Teklif takibi/);
    const row = await h().one<{ status: string; next: string; offer: string; updated_by: string }>(
      "select status, next_follow_up_at::text as next, offer_sent_at::text as offer, updated_by from crm_leads where id = $1",
      [l]
    );
    expect(row).toEqual({ status: "TAKIPTE", next: "2026-10-05", offer: "2026-09-22", updated_by: agentA });
  });

  it("aynı görev ikinci kez tamamlanamaz", async () => {
    const l = await lead("İkinci Kurum", { status: "OLUMSUZ" });
    const args = { key: `lostRecontact:${l}:2026-09-20`, kind: "lostRecontact", leadId: l, due: "2026-09-20", outcome: "ulasildi", actor: agentA };
    await complete(args);
    expect(await completeFailure({ ...args, actor: agentB })).toBe("CRM_TASK_ALREADY_DONE");
  });

  it("aday güncellemesi reddedilirse görev ve not da yazılmaz (tek transaction)", async () => {
    const l = await lead("Bölünmez Kurum", { status: "ARANACAK" });
    const failure = await completeFailure({
      key: `undatedFollowUp:${l}:2026-09-26`,
      kind: "undatedFollowUp",
      leadId: l,
      due: "2026-09-26",
      outcome: "ilgilenmiyor",
      note: "Not",
      // Kayıp nedeni yalnız "Satış olmadı"da olabilir → crm_leads_lost_reason_check.
      patch: { status: "TAKIPTE", lost_reason: "PRICE" },
      actor: agentA,
    });
    expect(failure).toBe("crm_leads_lost_reason_check");
    expect(await count("from crm_tasks where lead_id = $1", [l])).toBe(0);
    expect(await count("from crm_notes where lead_id = $1", [l])).toBe(0);
    expect((await h().one<{ status: string }>("select status from crm_leads where id = $1", [l])).status).toBe("ARANACAK");
  });

  it("izinli olmayan aday alanı ya da eksik anahtar reddedilir", async () => {
    const l = await lead("Alan Kurumu");
    const base = { key: `scheduled:${l}:2026-09-28`, kind: "scheduled", leadId: l, due: "2026-09-28", outcome: "ulasildi", actor: agentA };
    expect(await completeFailure({ ...base, patch: { sale_amount: 1 } })).toBe("CRM_TASK_INVALID");
    expect(await completeFailure({ ...base, key: null })).toBe("CRM_TASK_INVALID");
    expect(await completeFailure({ ...base, kind: "assigned" })).toBe("CRM_TASK_INVALID");
    expect(await completeFailure({ ...base, actor: null })).toBe("CRM_TASK_ACTOR_REQUIRED");
    expect(await count("from crm_tasks where lead_id = $1", [l])).toBe(0);
  });

  it("kurum görevi kuruma bağlanır; not bağlı adaya gider, aday yoksa yalnız görevde kalır", async () => {
    const inst = await newId();
    const l = await lead("Demo Kurumu", { institution_id: inst, status: "DEMO_TANIMLANDI" });
    const id = await complete({
      key: `demoEnding:${inst}:2026-10-10`,
      kind: "demoEnding",
      leadId: l,
      institutionId: inst,
      due: "2026-10-10",
      outcome: "ulasildi",
      note: "Demo bitmeden arandı",
      actor: agentA,
    });
    expect(await h().one("select lead_id, institution_id from crm_tasks where id = $1", [id])).toEqual({
      lead_id: null,
      institution_id: inst,
    });
    expect(await count("from crm_notes where lead_id = $1", [l])).toBe(1);

    const lonely = await newId();
    const id2 = await complete({
      key: `expired:${lonely}:2026-09-01`,
      kind: "expired",
      institutionId: lonely,
      due: "2026-09-01",
      outcome: "ulasilamadi",
      note: "Telefon kapalı",
      actor: agentB,
    });
    expect(await h().one("select result_note, lead_id from crm_tasks where id = $1", [id2])).toEqual({
      result_note: "Telefon kapalı",
      lead_id: null,
    });
  });

  it("kurum görevinde güncellenecek aday bulunamazsa görev de yazılmaz", async () => {
    const inst = await newId();
    const failure = await completeFailure({
      key: `annualRenewal:${inst}:2026-11-01`,
      kind: "annualRenewal",
      leadId: await newId(),
      institutionId: inst,
      due: "2026-11-01",
      outcome: "ulasildi",
      patch: { status: "TAKIPTE" },
      actor: admin,
    });
    expect(failure).toBe("CRM_TASK_LEAD_NOT_FOUND");
    expect(await count("from crm_tasks where institution_id = $1", [inst])).toBe(0);
  });
});

describe("crm_complete_task — elle atanan görev", () => {
  it("atanmış görevi yalnız atanan kişi ya da yönetici tamamlar; havuz görevini herkes", async () => {
    const l = await lead("Atanmış Kurum");
    const mine = await assigned(l, agentA);
    expect(await completeFailure({ taskId: mine, outcome: "ulasildi", actor: agentB })).toBe("CRM_TASK_NOT_ASSIGNEE");
    await complete({ taskId: mine, outcome: "ulasildi", note: "Görüşüldü", actor: agentA });
    expect(await completeFailure({ taskId: mine, outcome: "ulasildi", actor: agentA })).toBe("CRM_TASK_ALREADY_DONE");
    const row = await h().one<{ status: string; completed_by: string; result_note: string }>(
      "select status, completed_by, result_note from crm_tasks where id = $1",
      [mine]
    );
    expect(row).toEqual({ status: "DONE", completed_by: agentA, result_note: "Görüşüldü" });

    const other = await assigned(l, agentB);
    await complete({ taskId: other, outcome: "tekrar", actor: admin });
    const pool = await assigned(l);
    await complete({ taskId: pool, outcome: "ulasilamadi", actor: agentB });
    expect(await completeFailure({ taskId: await newId(), outcome: "ulasildi", actor: admin })).toBe("CRM_TASK_NOT_FOUND");
  });
});

describe("crm_reopen_task", () => {
  it("kural görevi: DONE satırı silinir; not ve aday değişikliği kalır", async () => {
    const l = await lead("Geri Alınan", { status: "ARANACAK" });
    const id = await complete({
      key: `undatedFollowUp:${l}:2026-09-26`,
      kind: "undatedFollowUp",
      leadId: l,
      due: "2026-09-26",
      outcome: "ulasildi",
      note: "Konuşuldu",
      patch: { next_follow_up_at: "2026-10-02" },
      actor: agentA,
    });
    expect(await reopen(id, agentB)).toBe("CRM_TASK_NOT_COMPLETER");
    expect(await reopen(id, agentA)).toBeNull();
    expect(await count("from crm_tasks where id = $1", [id])).toBe(0);
    expect(await count("from crm_notes where lead_id = $1", [l])).toBe(1);
    expect((await h().one<{ d: string }>("select next_follow_up_at::text as d from crm_leads where id = $1", [l])).d).toBe("2026-10-02");
    expect(await reopen(id, agentA)).toBe("CRM_TASK_NOT_FOUND");
  });

  it("elle atanan görev OPEN'a döner; yönetici başkasının tamamladığını geri alabilir", async () => {
    const l = await lead("Yeniden Açılan");
    const id = await assigned(l, agentA);
    expect(await reopen(id, agentA)).toBe("CRM_TASK_NOT_DONE");
    await complete({ taskId: id, outcome: "ulasildi", note: "Tamam", actor: agentA });
    expect(await reopen(id, admin)).toBeNull();
    const row = await h().one<Record<string, unknown>>(
      "select status, outcome, result_note, completed_at, completed_by from crm_tasks where id = $1",
      [id]
    );
    expect(row).toEqual({ status: "OPEN", outcome: null, result_note: null, completed_at: null, completed_by: null });
    // Yeniden tamamlanabilir.
    await complete({ taskId: id, outcome: "tekrar", actor: agentA });
  });
});
