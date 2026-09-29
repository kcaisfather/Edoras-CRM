/** 20260929190000_crm_surveys — anketler, davetler, yanıtlar, açılış ve yanıt fonksiyonları (PGlite, düzenek harness.ts). */
import { randomBytes } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, helpers } from "./harness";

let db: PGlite;
const h = () => helpers(db);
let actor: string;
let surveyId: string;

/** Sunucunun ürettiği biçimde token: 32 bayt rastgele → base64url (43 karakter). */
const newToken = () => randomBytes(32).toString("base64url");

/** Fonksiyonu sunucunun rolüyle (service_role) çağırır: yetkiler de sınanır. */
async function asService<T>(fn: () => Promise<T>): Promise<T> {
  await db.exec("set role service_role");
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}

async function fails(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (err) {
    const e = err as { message?: string; constraint?: string };
    return e.constraint ?? e.message ?? String(err);
  }
}

async function newLead(name = "Işık Koleji", institutionId: string | null = null): Promise<string> {
  return (
    await h().one<{ id: string }>("insert into crm_leads (organization_name, institution_id) values ($1, $2) returning id", [name, institutionId])
  ).id;
}

interface CreateArgs {
  leadId?: string | null;
  institutionId?: string | null;
  channel?: string;
  email?: string | null;
  phone?: string | null;
  token?: string;
  survey?: string;
  actorId?: string | null;
}

async function create(args: CreateArgs = {}): Promise<{ id: string; reused: boolean; token: string }> {
  const token = args.token ?? newToken();
  const res = await asService(() =>
    h().one<{ r: { id: string; reused: boolean } }>(
      "select crm_create_survey_invitation($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) as r",
      [
        args.survey ?? surveyId,
        token,
        args.leadId ?? null,
        args.institutionId ?? null,
        "Ayşe Yılmaz",
        "Işık Koleji",
        args.email ?? null,
        args.phone ?? null,
        args.channel ?? "LINK",
        args.actorId === undefined ? actor : args.actorId,
      ]
    )
  );
  return { ...res.r, token };
}

async function open(token: string): Promise<Record<string, unknown>> {
  return (await asService(() => h().one<{ r: Record<string, unknown> }>("select crm_survey_open($1) as r", [token]))).r;
}

async function submit(token: string, nps: number | null, csat: number | null, comment: string | null = null): Promise<string> {
  return (await asService(() => h().one<{ id: string }>("select crm_survey_submit($1, $2, $3, $4) as id", [token, nps, csat, comment]))).id;
}

const inv = (id: string) =>
  h().one<{
    status: string;
    sent_at: string | null;
    opened_at: string | null;
    responded_at: string | null;
    expires_at: string;
    created_at: string;
    lead_id: string | null;
  }>("select status, sent_at, opened_at, responded_at, expires_at, created_at, lead_id from crm_survey_invitations where id = $1", [id]);

beforeAll(async () => {
  db = await createTestDb();
  actor = await h().newUser("temsilci@edorasapp.ai");
  surveyId = (await h().one<{ id: string }>("select id from crm_surveys where is_default")).id;
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe("kurulum", () => {
  it("anket tabloları anon ve authenticated rollerine kapalı", async () => {
    for (const role of ["anon", "authenticated"]) {
      for (const table of ["crm_surveys", "crm_survey_invitations", "crm_survey_responses"]) {
        await db.exec(`set role ${role}`);
        const res = await h().failure(`select * from public.${table}`);
        await db.exec("reset role");
        expect(res, `${role} ${table}`).toMatch(/permission denied/);
      }
    }
  });

  it("fonksiyonlar PUBLIC'e kapalı, service_role'e açık", async () => {
    const callable = [
      "public.crm_create_survey_invitation(uuid, text, uuid, uuid, text, text, text, text, text, uuid)",
      "public.crm_survey_open(text)",
      "public.crm_survey_submit(text, integer, integer, text)",
      "public.crm_survey_questions_valid(jsonb)",
    ];
    for (const fn of [...callable, "public.crm_survey_invitations_guard()"]) {
      for (const role of ["anon", "authenticated"]) {
        const row = await h().one<{ ok: boolean }>("select has_function_privilege($1, $2, 'execute') as ok", [role, fn]);
        expect(row.ok, `${role} ${fn}`).toBe(false);
      }
    }
    for (const fn of callable) {
      const row = await h().one<{ ok: boolean }>("select has_function_privilege('service_role', $1, 'execute') as ok", [fn]);
      expect(row.ok, fn).toBe(true);
    }
  });

  it("varsayılan anket yazılı: NPS + memnuniyet zorunlu, yorum isteğe bağlı, link 30 gün, Edoras dili", async () => {
    const row = await h().one<{ code: string; title: string; link_valid_days: number; questions: { id: string; type: string; required: boolean; text: string }[] }>(
      "select code, title, link_valid_days, questions from crm_surveys where is_default"
    );
    expect(row.code).toBe("DEFAULT_NPS_CSAT");
    expect(row.link_valid_days).toBe(30);
    expect(row.questions.map((q) => [q.type, q.required])).toEqual([
      ["NPS", true],
      ["CSAT", true],
      ["COMMENT", false],
    ]);
    const text = [row.title, ...row.questions.map((q) => q.text)].join(" ");
    expect(text).toContain("Edoras");
    expect(text).not.toMatch(/DeepSport|antrenör|sporcu/i);
  });
});

describe("anket kuralları", () => {
  const insert = (cols: Record<string, unknown>) => {
    const keys = Object.keys(cols);
    return h().failure(
      `insert into crm_surveys (${keys.join(", ")}) values (${keys.map((_, i) => `$${i + 1}`).join(", ")})`,
      Object.values(cols)
    );
  };
  const q = (over: Record<string, unknown> = {}) => ({ id: "nps", type: "NPS", required: true, ...over });

  it("en çok bir varsayılan anket", async () => {
    expect(await insert({ code: "IKINCI", title: "İkinci", questions: JSON.stringify([q()]), is_default: true })).toBe("crm_surveys_default_key");
    expect(await insert({ code: "IKINCI", title: "İkinci", questions: JSON.stringify([q()]), is_default: false })).toBeNull();
  });

  it.each([
    ["dizi değil", { id: "nps" }],
    ["boş dizi", []],
    ["bilinmeyen tür", [q({ type: "STARS" })]],
    ["required eksik", [{ id: "nps", type: "NPS" }]],
    ["required metin", [q({ required: "true" })]],
    ["geçersiz kimlik", [q({ id: "N P S" })]],
    ["aynı tür iki kez", [q(), q({ id: "nps2" })]],
    ["aynı kimlik iki kez", [q(), q({ type: "CSAT" })]],
    ["metin sayı", [q({ text: 5 })]],
    ["dizide nesne olmayan", [q(), 3]],
  ])("sorular geçersiz: %s", async (_label, questions) => {
    expect(await insert({ code: "BOZUK", title: "Bozuk", questions: JSON.stringify(questions) })).toBe("crm_surveys_questions_check");
  });

  it("kod biçimi, başlık ve link süresi (1–365 gün)", async () => {
    const ok = JSON.stringify([q()]);
    expect(await insert({ code: "kucuk", title: "A", questions: ok })).toBe("crm_surveys_code_check");
    expect(await insert({ code: "BASLIK", title: "  ", questions: ok })).toBe("crm_surveys_title_check");
    expect(await insert({ code: "SIFIR", title: "A", questions: ok, link_valid_days: 0 })).toBe("crm_surveys_link_valid_days_check");
    expect(await insert({ code: "UZUN", title: "A", questions: ok, link_valid_days: 366 })).toBe("crm_surveys_link_valid_days_check");
    expect(await insert({ code: "YIL", title: "A", questions: ok, link_valid_days: 365 })).toBeNull();
  });
});

describe("crm_create_survey_invitation", () => {
  it("davet açar: CREATED, link süresi anketinki (30 gün), aktör oturumdan", async () => {
    const lead = await newLead();
    const r = await create({ leadId: lead });
    expect(r.reused).toBe(false);
    const row = await h().one<{ status: string; days: number; created_by: string; token: string }>(
      "select status, round(extract(epoch from (expires_at - created_at)) / 86400)::int as days, created_by, token from crm_survey_invitations where id = $1",
      [r.id]
    );
    expect(row).toEqual({ status: "CREATED", days: 30, created_by: actor, token: r.token });
  });

  it("aynı alıcıya 7 gün içinde yanıtsız davet varsa yenisini açmaz (kanal fark etmez)", async () => {
    const lead = await newLead("Tekrar Koleji");
    const first = await create({ leadId: lead, channel: "WHATSAPP", phone: "+905321234567" });
    const again = await create({ leadId: lead, channel: "EMAIL", email: "a@kurum.test" });
    expect(again).toMatchObject({ id: first.id, reused: true });
    expect((await h().one<{ n: number }>("select count(*)::int as n from crm_survey_invitations where lead_id = $1", [lead])).n).toBe(1);
  });

  it("kurum üzerinden de aynı alıcı sayılır", async () => {
    const institution = "00000000-0000-4000-8000-000000000301";
    const first = await create({ institutionId: institution });
    expect(await create({ institutionId: institution })).toMatchObject({ id: first.id, reused: true });
    // Kuruma bağlı adayla gelen istek de aynı daveti bulur.
    const lead = await newLead("Bağlı Koleji", institution);
    expect(await create({ leadId: lead, institutionId: institution })).toMatchObject({ id: first.id, reused: true });
  });

  it("7 günden eski, yanıtlanmış, süresi dolmuş ya da başarısız davet yenisini engellemez", async () => {
    for (const setup of [
      "update crm_survey_invitations set created_at = now() - interval '8 days' where id = $1",
      "update crm_survey_invitations set status = 'EXPIRED' where id = $1",
      "update crm_survey_invitations set expires_at = now() - interval '1 second', created_at = now() - interval '3 days' where id = $1",
      "update crm_survey_invitations set status = 'FAILED', error = 'resend:500' where id = $1",
    ]) {
      const lead = await newLead();
      const first = await create({ leadId: lead });
      await db.query(setup, [first.id]);
      const next = await create({ leadId: lead });
      expect(next.reused, setup).toBe(false);
      expect(next.id).not.toBe(first.id);
    }
    const lead = await newLead();
    const first = await create({ leadId: lead });
    await submit(first.token, 9, 5);
    expect((await create({ leadId: lead })).reused).toBe(false);
  });

  it("alıcısız, aktörsüz, bilinmeyen aday ya da ankete davet açılmaz", async () => {
    expect(await fails(() => create({}))).toMatch(/CRM_SURVEY_RECIPIENT_REQUIRED/);
    expect(await fails(async () => create({ leadId: await newLead(), actorId: null }))).toMatch(/CRM_SURVEY_ACTOR_REQUIRED/);
    expect(await fails(() => create({ leadId: "00000000-0000-4000-8000-000000000999" }))).toMatch(/CRM_SURVEY_LEAD_NOT_FOUND/);
    expect(await fails(async () => create({ leadId: await newLead(), survey: "00000000-0000-4000-8000-000000000998" }))).toMatch(
      /CRM_SURVEY_NOT_FOUND/
    );
  });

  it("token ≥ 43 karakter base64url ve benzersiz", async () => {
    expect(await fails(async () => create({ leadId: await newLead(), token: "kisa" }))).toBe("crm_survey_invitations_token_check");
    expect(await fails(async () => create({ leadId: await newLead(), token: `${"a".repeat(42)}.` }))).toBe("crm_survey_invitations_token_check");
    const token = newToken();
    await create({ leadId: await newLead(), token });
    expect(await fails(async () => create({ leadId: await newLead(), token }))).toBe("crm_survey_invitations_token_key");
  });

  it("kanalın gerektirdiği iletişim; telefon E.164, e-posta küçük harf", async () => {
    expect(await fails(async () => create({ leadId: await newLead(), channel: "EMAIL" }))).toBe("crm_survey_invitations_contact_check");
    expect(await fails(async () => create({ leadId: await newLead(), channel: "SMS" }))).toBe("crm_survey_invitations_contact_check");
    expect(await fails(async () => create({ leadId: await newLead(), channel: "WHATSAPP", phone: "0532 123 45 67" }))).toBe(
      "crm_survey_invitations_phone_check"
    );
    expect(await fails(async () => create({ leadId: await newLead(), channel: "EMAIL", email: "Ayse@Kurum.test" }))).toBe(
      "crm_survey_invitations_email_check"
    );
    expect(await fails(async () => create({ leadId: await newLead(), channel: "FAX" }))).toBe("crm_survey_invitations_channel_check");
  });
});

describe("davet durumu", () => {
  it("durum ↔ anlar tutarlı: gönderim anı, yanıt anı, hata kodu", async () => {
    const { id } = await create({ leadId: await newLead() });
    expect(await h().failure("update crm_survey_invitations set status = 'SENT' where id = $1", [id])).toBe("crm_survey_invitations_state_check");
    expect(await h().failure("update crm_survey_invitations set status = 'FAILED' where id = $1", [id])).toBe(
      "crm_survey_invitations_state_check"
    );
    expect(await h().failure("update crm_survey_invitations set responded_at = now() where id = $1", [id])).toBe(
      "crm_survey_invitations_state_check"
    );
    expect(await h().failure("update crm_survey_invitations set status = 'SENT', sent_at = now() where id = $1", [id])).toBeNull();
    expect(await h().failure("update crm_survey_invitations set status = 'OPENED' where id = $1", [id])).toBe(
      "crm_survey_invitations_state_check"
    );
  });

  it("token ve anket değişmez; yanıtlanmış davet geri dönmez", async () => {
    const r = await create({ leadId: await newLead() });
    expect(await h().failure("update crm_survey_invitations set token = $2 where id = $1", [r.id, newToken()])).toMatch(/CRM_SURVEY_INVALID/);
    await submit(r.token, 10, 5);
    expect(await h().failure("update crm_survey_invitations set status = 'SENT' where id = $1", [r.id])).toMatch(/CRM_SURVEY_ANSWERED/);
  });

  it("aday silinince davet ve yanıt kalır, bağ boşalır", async () => {
    const lead = await newLead("Silinen Koleji");
    const r = await create({ leadId: lead });
    const responseId = await submit(r.token, 3, 2, "Yavaş");
    expect(await h().failure("delete from crm_leads where id = $1", [lead])).toBeNull();
    expect((await inv(r.id)).lead_id).toBeNull();
    const resp = await h().one<{ lead_id: string | null; nps: number }>("select lead_id, nps from crm_survey_responses where id = $1", [responseId]);
    expect(resp).toEqual({ lead_id: null, nps: 3 });
  });
});

describe("crm_survey_open", () => {
  it("geçersiz token NOT_FOUND", async () => {
    expect(await open(newToken())).toEqual({ state: "NOT_FOUND" });
  });

  it("ilk açılışta OPENED (bir kez); yalnız başlık, giriş, sorular ve alıcı adı döner", async () => {
    const r = await create({ leadId: await newLead() });
    const first = await open(r.token);
    expect(Object.keys(first).sort()).toEqual(["intro", "questions", "recipient_name", "state", "title"]);
    expect(first).toMatchObject({ state: "OPEN", title: "Edoras memnuniyet anketi", recipient_name: "Ayşe Yılmaz" });
    const opened = await inv(r.id);
    expect(opened.status).toBe("OPENED");
    // "Gönderdim" denmeden açıldıysa gönderim anı açılış anıdır.
    expect(opened.sent_at).not.toBeNull();
    await db.query("update crm_survey_invitations set opened_at = opened_at - interval '1 hour' where id = $1", [r.id]);
    const before = (await inv(r.id)).opened_at;
    await open(r.token);
    expect((await inv(r.id)).opened_at).toEqual(before);
  });

  it("süresi dolan davet EXPIRED olur (tembel yazım); yanıtlanan ANSWERED", async () => {
    const r = await create({ leadId: await newLead() });
    await db.query("update crm_survey_invitations set created_at = now() - interval '31 days', expires_at = now() - interval '1 minute' where id = $1", [
      r.id,
    ]);
    expect(await open(r.token)).toEqual({ state: "EXPIRED" });
    expect((await inv(r.id)).status).toBe("EXPIRED");
    const answered = await create({ leadId: await newLead() });
    await submit(answered.token, 8, 4);
    expect(await open(answered.token)).toEqual({ state: "ANSWERED" });
  });
});

describe("crm_survey_submit", () => {
  it("yanıt + davet RESPONDED tek işlemde; yorum kırpılır; ikinci yanıt reddedilir", async () => {
    const lead = await newLead();
    const r = await create({ leadId: lead, institutionId: "00000000-0000-4000-8000-000000000302" });
    const id = await submit(r.token, 10, 5, "  Çok iyi  ");
    const resp = await h().one<{ nps: number; csat: number; comment: string; lead_id: string; institution_id: string; survey_id: string }>(
      "select nps, csat, comment, lead_id, institution_id, survey_id from crm_survey_responses where id = $1",
      [id]
    );
    expect(resp).toEqual({
      nps: 10,
      csat: 5,
      comment: "Çok iyi",
      lead_id: lead,
      institution_id: "00000000-0000-4000-8000-000000000302",
      survey_id: surveyId,
    });
    const after = await inv(r.id);
    expect(after.status).toBe("RESPONDED");
    expect(after.responded_at && after.opened_at && after.sent_at).toBeTruthy();
    expect(await fails(() => submit(r.token, 1, 1))).toMatch(/CRM_SURVEY_ANSWERED/);
    expect((await h().one<{ n: number }>("select count(*)::int as n from crm_survey_responses where invitation_id = $1", [r.id])).n).toBe(1);
  });

  it("geçersiz token ve süresi dolmuş davet", async () => {
    expect(await fails(() => submit(newToken(), 9, 5))).toMatch(/CRM_SURVEY_NOT_FOUND/);
    const r = await create({ leadId: await newLead() });
    await db.query("update crm_survey_invitations set created_at = now() - interval '31 days', expires_at = now() - interval '1 minute' where id = $1", [
      r.id,
    ]);
    expect(await fails(() => submit(r.token, 9, 5))).toMatch(/CRM_SURVEY_EXPIRED/);
    expect((await inv(r.id)).status).toBe("CREATED");
  });

  it.each([
    ["NPS zorunlu", null, 5, null],
    ["memnuniyet zorunlu", 9, null, null],
    ["NPS aralık dışı", 11, 5, null],
    ["NPS negatif", -1, 5, null],
    ["memnuniyet 0", 9, 0, null],
    ["yorum 2000'i aşar", 9, 5, "x".repeat(2001)],
  ])("geçersiz yanıt: %s", async (_label, nps, csat, comment) => {
    const r = await create({ leadId: await newLead() });
    expect(await fails(() => submit(r.token, nps, csat, comment))).toMatch(/CRM_SURVEY_ANSWER_INVALID/);
    expect((await inv(r.id)).status).toBe("CREATED");
  });

  it("ankette olmayan soruya yanıt ve tamamen boş yanıt reddedilir", async () => {
    const onlyComment = (
      await h().one<{ id: string }>(
        "insert into crm_surveys (code, title, questions) values ('YORUM', 'Yorum', $1) returning id",
        [JSON.stringify([{ id: "comment", type: "COMMENT", required: false }])]
      )
    ).id;
    const r = await create({ leadId: await newLead(), survey: onlyComment });
    expect(await fails(() => submit(r.token, 9, null))).toMatch(/CRM_SURVEY_ANSWER_INVALID/);
    expect(await fails(() => submit(r.token, null, null, "   "))).toMatch(/CRM_SURVEY_ANSWER_INVALID/);
    expect(await fails(() => submit(r.token, null, null, "Teşekkürler"))).toBeNull();
  });

  it("yanıt tablosu kuralları doğrudan yazımda da geçerli", async () => {
    const r = await create({ leadId: await newLead() });
    const ins = (nps: number | null, csat: number | null, comment: string | null) =>
      h().failure("insert into crm_survey_responses (survey_id, invitation_id, nps, csat, comment) values ($1, $2, $3, $4, $5)", [
        surveyId,
        r.id,
        nps,
        csat,
        comment,
      ]);
    expect(await ins(11, null, null)).toBe("crm_survey_responses_nps_check");
    expect(await ins(null, 6, null)).toBe("crm_survey_responses_csat_check");
    expect(await ins(null, null, "")).toBe("crm_survey_responses_comment_check");
    expect(await ins(null, null, null)).toBe("crm_survey_responses_answer_check");
    expect(await ins(7, null, null)).toBeNull();
    expect(await ins(8, null, null)).toBe("crm_survey_responses_invitation_key");
  });
});
