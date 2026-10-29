/**
 * Yönetim (KCA Panel) veri katmanı — bellek içi KCA Panel veritabanı + Hrana HTTP taklidi üzerinden uçtan uca.
 * Asıl soru: Edoras etiketi olmayan görev / toplantı notu / network kaydı hiçbir yoldan görünmüyor ve yazılamıyor mu;
 * KCA Panel yetkileri (üyelik, sahiplik, kişiye özel network) aynen uygulanıyor mu.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createFakeTurso, kcaHashPassword, type FakeTurso } from "./kca-test-support";
import { KcaDbError, createTursoHttpDb, pipelineEndpoint, type KcaDb } from "./kca-turso";
import {
  KcaRuleError,
  addTaskComment,
  approveTask,
  createContact,
  createMeeting,
  createTask,
  deleteContact,
  deleteMeeting,
  deleteTask,
  listContacts,
  listMeetings,
  listTasks,
  loadAccess,
  loadEdorasScope,
  loadGate,
  loadLinkedUser,
  meetingDetail,
  passwordFingerprint,
  requestTaskChanges,
  sessionData,
  setMeetingProcessed,
  taskDetail,
  updateContact,
  updateMeeting,
  updateTask,
  verifyKcaLogin,
  type EdorasScope,
  type KcaAccess,
  type KcaUser,
} from "./kca-store";

const TODAY = "2026-10-14";
let fake: FakeTurso;
let db: KcaDb;
let scope: EdorasScope;
const ids = {} as Record<string, number>;
const users = {} as Record<"kamil" | "eren" | "ayse", KcaUser>;
const access = {} as Record<"kamil" | "eren" | "ayse", KcaAccess>;

function insert(sql: string, ...params: unknown[]): number {
  const row = fake.db.prepare(`${sql} RETURNING id`).all(...params)[0] as { id: number };
  return Number(row.id);
}
const row = <T>(sql: string, ...params: unknown[]) => fake.db.prepare(sql).all(...params)[0] as T;

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "OK";
  } catch (err) {
    if (err instanceof KcaRuleError) return `${err.status} ${err.code}`;
    if (err instanceof KcaDbError) return err.reason;
    throw err;
  }
}

const KAMIL_PW = "kamil-gizli-sifre";
const EREN_PW = "eren-gizli-sifre";

beforeAll(async () => {
  fake = createFakeTurso();
  db = createTursoHttpDb({ url: "libsql://kca-test.turso.io", authToken: "tok", fetch: fake.fetch });

  const user = (name: string, email: string, pw: string, extra = "") =>
    insert(`INSERT INTO users (name, email, password_hash${extra ? ", is_admin" : ""}) VALUES (?, ?, ?${extra ? ", 1" : ""})`, name, email, kcaHashPassword(pw));
  ids.kamil = user("Kamil", "kamil@kca.test", KAMIL_PW, "admin");
  ids.eren = user("Eren", "eren@kca.test", EREN_PW);
  ids.ayse = user("Ayşe", "ayse@kca.test", "ayse-gizli-sifre");
  ids.agent = insert("INSERT INTO users (name, email, password_hash, is_agent, agent_role) VALUES ('Claude · Ürün Yöneticisi', 'claude-pm@ai.local', 'agent$no-password', 1, 'pm')");
  ids.passive = user("Pasif", "pasif@kca.test", "pasif-gizli-sifre");
  fake.db.prepare("UPDATE users SET active = 0 WHERE id = ?").run(ids.passive);

  ids.edoras = insert("INSERT INTO projects (name, color) VALUES ('Edoras', '#112233')");
  ids.mobil = insert("INSERT INTO projects (name, parent_id) VALUES ('Edoras Mobil', ?)", ids.edoras);
  ids.deepsport = insert("INSERT INTO projects (name) VALUES ('DeepSport')");
  ids.clinic = insert("INSERT INTO projects (name, parent_id) VALUES ('DeepClinic', ?)", ids.deepsport);
  ids.edorasEski = insert("INSERT INTO projects (name) VALUES ('Edoras Eski')");

  const member = (p: number, u: number, create: number, due: number) =>
    fake.db.prepare("INSERT INTO project_members (project_id, user_id, can_create_tasks, can_edit_due_dates) VALUES (?, ?, ?, ?)").run(p, u, create, due);
  member(ids.edoras, ids.kamil, 1, 1);
  member(ids.mobil, ids.eren, 1, 0);
  member(ids.deepsport, ids.eren, 1, 1);
  member(ids.edoras, ids.ayse, 0, 0);

  const task = (p: number, title: string, assignee: number | null, status = "todo") =>
    insert("INSERT INTO tasks (project_id, title, assignee_id, status, created_by) VALUES (?, ?, ?, ?, ?)", p, title, assignee, status, ids.kamil);
  ids.tEdoras = task(ids.edoras, "Edoras sözleşmesi", ids.kamil);
  ids.tMobil = task(ids.mobil, "Mobil sürüm", ids.eren, "review");
  ids.tAyse = task(ids.edoras, "Ayşe'nin işi", ids.ayse);
  ids.tDeep = task(ids.deepsport, "DeepSport raporu", ids.eren);
  ids.tClinic = task(ids.clinic, "Klinik görüşmesi", null);
  ids.tEski = task(ids.edorasEski, "Eski proje", ids.kamil);

  const meeting = (owner: number, project: number | null, title: string, shared = 0) =>
    insert("INSERT INTO meetings (owner_id, project_id, title, meeting_date, body, shared) VALUES (?, ?, ?, '2026-10-10', 'not', ?)", owner, project, title, shared);
  ids.mKamilEdoras = meeting(ids.kamil, ids.edoras, "Edoras yatırımcı");
  ids.mKamilDeep = meeting(ids.kamil, ids.deepsport, "DeepSport okullar");
  ids.mKamilNone = meeting(ids.kamil, null, "Firmasız toplantı");
  ids.mErenShared = meeting(ids.eren, ids.mobil, "Mobil sprint (paylaşılan)", 1);
  ids.mErenPrivate = meeting(ids.eren, ids.mobil, "Mobil özel");
  ids.mKamilMobilShared = meeting(ids.kamil, ids.mobil, "Mobil yol haritası", 1);
  fake.db.prepare("UPDATE tasks SET meeting_id = ? WHERE id IN (?, ?)").run(ids.mKamilEdoras, ids.tEdoras, ids.tDeep);

  const contact = (owner: number, project: number | null, name: string) =>
    insert("INSERT INTO contacts (owner_id, project_id, name, phone) VALUES (?, ?, ?, '0532')", owner, project, name);
  ids.cKamilEdoras = contact(ids.kamil, ids.edoras, "Okul Müdürü");
  ids.cKamilDeep = contact(ids.kamil, ids.deepsport, "Kulüp Başkanı");
  ids.cKamilNone = contact(ids.kamil, null, "Firmasız Kişi");
  ids.cErenEdoras = contact(ids.eren, ids.mobil, "Eren'in Kişisi");

  scope = (await loadEdorasScope(db))!;
  for (const k of ["kamil", "eren", "ayse"] as const) {
    const r = await loadLinkedUser(db, ids[k], passwordFingerprint(row<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = ?", ids[k]).password_hash));
    if (!r.ok) throw new Error(k);
    users[k] = r.user;
    access[k] = await loadAccess(db, r.user, scope, TODAY);
  }
}, 30_000);

describe("Turso HTTP istemcisi", () => {
  it("libsql adresi → https /v2/pipeline", () => {
    expect(pipelineEndpoint("libsql://ad-kullanici.turso.io/")).toBe("https://ad-kullanici.turso.io/v2/pipeline");
    expect(pipelineEndpoint("https://ad.turso.io")).toBe("https://ad.turso.io/v2/pipeline");
  });

  it("değerler gidip gelir: tamsayı, ondalık, metin, null, mantıksal", async () => {
    const r = await db.execute("SELECT ? AS i, ? AS f, ? AS t, ? AS n, ? AS b", [42, 1.5, "Çağrı", null, true]);
    expect(r.rows[0]).toEqual({ i: 42, f: 1.5, t: "Çağrı", n: null, b: 1 });
  });

  it("HTTP hatası ve SQL hatası yalnız kısa kodla düşer (gövde / SQL mesajı taşınmaz)", async () => {
    fake.failNext(500);
    expect(await code(db.execute("SELECT 1"))).toBe("turso:500");
    const sqlErr = await db.execute("SELECT * FROM yok_boyle_tablo").catch((e: unknown) => e);
    expect(sqlErr).toBeInstanceOf(KcaDbError);
    expect((sqlErr as KcaDbError).message).toBe("turso:sql");
  });
});

describe("hesap bağlama", () => {
  it("doğru şifre → kullanıcı + parmak izi; e-posta büyük/küçük harf duyarsız", async () => {
    const r = await verifyKcaLogin(db, "  KAMIL@kca.test ", KAMIL_PW);
    expect(r.user).toEqual({ id: ids.kamil, name: "Kamil", email: "kamil@kca.test", isAdmin: true });
    expect(r.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it("yanlış şifre, AI ekip, pasif hesap ve olmayan e-posta → KCA_LOGIN_FAILED; denemeler KCA Panel kilidine yazılır", async () => {
    expect(await code(verifyKcaLogin(db, "eren@kca.test", "yanlis-sifre"))).toBe("400 KCA_LOGIN_FAILED");
    expect(await code(verifyKcaLogin(db, "claude-pm@ai.local", "agent$no-password"))).toBe("400 KCA_LOGIN_FAILED");
    expect(await code(verifyKcaLogin(db, "pasif@kca.test", "pasif-gizli-sifre"))).toBe("400 KCA_LOGIN_FAILED");
    expect(await code(verifyKcaLogin(db, "kimse@kca.test", "x"))).toBe("400 KCA_LOGIN_FAILED");
    expect(row<{ n: number }>("SELECT COUNT(*) AS n FROM login_attempts WHERE email = 'eren@kca.test'").n).toBe(1);
  });

  it("15 dakikada 8 hatalı deneme → kilit (doğru şifre de reddedilir); başarılı giriş sayacı temizler", async () => {
    const now = Date.now();
    for (let i = 0; i < 8; i++) fake.db.prepare("INSERT INTO login_attempts (email, at) VALUES ('ayse@kca.test', ?)").run(now - 1000);
    expect(await code(verifyKcaLogin(db, "ayse@kca.test", "ayse-gizli-sifre", now))).toBe("429 KCA_LOGIN_LOCKED");
    expect(await code(verifyKcaLogin(db, "ayse@kca.test", "ayse-gizli-sifre", now + 16 * 60 * 1000))).toBe("OK");
    expect(row<{ n: number }>("SELECT COUNT(*) AS n FROM login_attempts WHERE email = 'ayse@kca.test'").n).toBe(0);
  });

  it("şifre değişince bağ düşer; hesap pasifleşince de", async () => {
    const id = insert("INSERT INTO users (name, email, password_hash) VALUES ('Geçici', 'gecici@kca.test', ?)", kcaHashPassword("ilk-sifre-123"));
    const { fingerprint } = await verifyKcaLogin(db, "gecici@kca.test", "ilk-sifre-123");
    expect((await loadLinkedUser(db, id, fingerprint)).ok).toBe(true);
    fake.db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(kcaHashPassword("yeni-sifre-456"), id);
    expect(await loadLinkedUser(db, id, fingerprint)).toEqual({ ok: false, reason: "PASSWORD_CHANGED" });
    fake.db.prepare("UPDATE users SET active = 0 WHERE id = ?").run(id);
    expect(await loadLinkedUser(db, id, fingerprint)).toEqual({ ok: false, reason: "INACTIVE" });
  });
});

describe("Edoras kapsamı", () => {
  it("kök 'Edoras' ana projesi + alt projeleri; benzer adlı başka ana proje ve DeepSport dahil değil", () => {
    expect(scope.rootId).toBe(ids.edoras);
    expect(scope.ids.sort()).toEqual([ids.edoras, ids.mobil].sort());
  });

  it("KCA_EDORAS_PROJECT_ID verilirse o ana proje; alt proje kimliği kök olamaz", async () => {
    expect((await loadEdorasScope(db, ids.edoras))?.ids.length).toBe(2);
    expect(await loadEdorasScope(db, ids.mobil)).toBeNull();
  });

  it("adı 'Edoras' olan iki ana proje varsa hiçbir şey gösterilmez", async () => {
    const dup = insert("INSERT INTO projects (name) VALUES ('EDORAS')");
    expect(await loadEdorasScope(db)).toBeNull();
    fake.db.prepare("DELETE FROM projects WHERE id = ?").run(dup);
  });

  it("loadGate: kullanıcı + kapsam + yetki TEK HTTP isteğinde, tek tek yüklemeyle aynı sonuç", async () => {
    let calls = 0;
    const counting = createTursoHttpDb({
      url: "libsql://kca-test.turso.io",
      authToken: "tok",
      fetch: ((...a: Parameters<typeof fetch>) => {
        calls++;
        return fake.fetch(...a);
      }) as typeof fetch,
    });
    for (const k of ["kamil", "eren", "ayse"] as const) {
      const fp = passwordFingerprint(row<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = ?", ids[k]).password_hash);
      calls = 0;
      const gate = await loadGate(counting, ids[k], fp, null, TODAY);
      expect(calls).toBe(1);
      expect(gate.linked.ok && gate.linked.user).toEqual(users[k]);
      expect(gate.scope).toEqual(scope);
      expect(gate.access?.visibleIds).toEqual(access[k].visibleIds);
      expect([...(gate.access?.projects ?? [])]).toEqual([...access[k].projects]);
    }
  });

  it("loadGate: şifre değişmiş → PASSWORD_CHANGED, pasif / AI hesap → INACTIVE, alt proje kök olamaz → kapsam yok", async () => {
    const fp = passwordFingerprint(row<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = ?", ids.ayse).password_hash);
    expect((await loadGate(db, ids.ayse, "baska-parmak-izi", null, TODAY)).linked).toEqual({ ok: false, reason: "PASSWORD_CHANGED" });
    expect((await loadGate(db, ids.passive, "x", null, TODAY)).linked).toEqual({ ok: false, reason: "INACTIVE" });
    expect((await loadGate(db, ids.agent, "x", null, TODAY)).linked).toEqual({ ok: false, reason: "INACTIVE" });
    const noScope = await loadGate(db, ids.ayse, fp, ids.mobil, TODAY);
    expect(noScope.linked.ok).toBe(true);
    expect(noScope.scope).toBeNull();
    expect(noScope.access).toBeNull();
  });

  it("erişim KCA Panel üyeliğinden: yönetici hepsini, üye yalnız kendi projesini görür", async () => {
    expect(access.kamil.visibleIds.sort()).toEqual([ids.edoras, ids.mobil].sort());
    expect(access.eren.visibleIds).toEqual([ids.mobil]);
    expect(access.ayse.visibleIds).toEqual([ids.edoras]);
    expect(access.eren.projects.get(ids.mobil)).toMatchObject({ canCreateTasks: true, canEditDueDates: false });
    const s = await sessionData(db, access.eren);
    expect(s.projects.map((p) => p.name)).toEqual(["Edoras Mobil"]);
    expect(s.members.map((m) => m.name)).toEqual(["Eren"]);
  });
});

describe("görevler", () => {
  it("liste yalnız görülen Edoras projelerinden; DeepSport / DeepClinic / 'Edoras Eski' hiç gelmez", async () => {
    const titles = (await listTasks(db, access.kamil)).map((t) => t.title).sort();
    expect(titles).toEqual(["Ayşe'nin işi", "Edoras sözleşmesi", "Mobil sürüm"]);
    expect((await listTasks(db, access.eren)).map((t) => t.title)).toEqual(["Mobil sürüm"]);
  });

  it("kapsam dışı görev yönetici için de bulunamadı; yazılamaz", async () => {
    for (const id of [ids.tDeep, ids.tClinic, ids.tEski]) {
      expect(await code(taskDetail(db, access.kamil, id))).toBe("404 NOT_FOUND");
      expect(await code(updateTask(db, access.kamil, id, { status: "done" }))).toBe("404 NOT_FOUND");
      expect(await code(addTaskComment(db, access.kamil, id, "x"))).toBe("404 NOT_FOUND");
      expect(await code(deleteTask(db, access.kamil, id))).toBe("404 NOT_FOUND");
    }
    expect(await code(taskDetail(db, access.eren, ids.tEdoras))).toBe("404 NOT_FOUND");
  });

  it("ayrıntı: yorumlar, geçmiş (sorumlu adla), üyeler, yetkiler", async () => {
    await updateTask(db, access.kamil, ids.tEdoras, { assigneeId: null });
    await addTaskComment(db, access.kamil, ids.tEdoras, "Avukata gönderildi");
    const d = await taskDetail(db, access.kamil, ids.tEdoras);
    expect(d.task.createdByName).toBe("Kamil");
    expect(d.task.meetingId).toBe(ids.mKamilEdoras);
    expect(d.comments.map((c) => c.body)).toEqual(["Avukata gönderildi"]);
    expect(d.events.at(-1)).toMatchObject({ kind: "assignee", oldValue: "Kamil", newValue: null, userName: "Kamil" });
    expect(d.members.map((m) => m.name).sort()).toEqual(["Ayşe", "Kamil"]);
    expect(d.perms).toEqual({ canCreateTasks: true, canEditDueDates: true, isAssignee: false });
    await updateTask(db, access.kamil, ids.tEdoras, { assigneeId: ids.kamil });
  });

  it("görev aç: yetki, sorumlu üyeliği, kapsam; 'created' geçmişi yazılır", async () => {
    expect(await code(createTask(db, access.kamil, { projectId: ids.deepsport, title: "x", subject: null, description: null, assigneeId: null, priority: "normal", dueDate: null, meetingId: null }))).toBe("404 NOT_FOUND");
    expect(await code(createTask(db, access.ayse, { projectId: ids.edoras, title: "x", subject: null, description: null, assigneeId: null, priority: "normal", dueDate: null, meetingId: null }))).toBe("403 KCA_FORBIDDEN");
    expect(await code(createTask(db, access.eren, { projectId: ids.mobil, title: "x", subject: null, description: null, assigneeId: ids.ayse, priority: "normal", dueDate: null, meetingId: null }))).toBe("400 KCA_ASSIGNEE_INVALID");
    expect(await code(createTask(db, access.kamil, { projectId: ids.edoras, title: "x", subject: null, description: null, assigneeId: null, priority: "normal", dueDate: null, meetingId: ids.mKamilDeep }))).toBe("404 NOT_FOUND");

    const { id } = await createTask(db, access.eren, {
      projectId: ids.mobil,
      title: "Mağaza görselleri",
      subject: "Yayın",
      description: null,
      assigneeId: ids.eren,
      priority: "high",
      dueDate: "2026-10-20",
      meetingId: ids.mErenShared,
    });
    const t = row<Record<string, unknown>>("SELECT * FROM tasks WHERE id = ?", id);
    expect(t).toMatchObject({ project_id: ids.mobil, title: "Mağaza görselleri", subject: "Yayın", assignee_id: ids.eren, priority: "high", due_date: "2026-10-20", meeting_id: ids.mErenShared, created_by: ids.eren, status: "todo" });
    expect(row<{ kind: string; new_value: string }>("SELECT kind, new_value FROM task_events WHERE task_id = ?", id)).toEqual({ kind: "created", new_value: "Mağaza görselleri" });
  });

  it("güncelle: son tarih ayrı yetki; durum sorumluya açık; bilgi alanı görev girme yetkisi ister", async () => {
    expect(await code(updateTask(db, access.eren, ids.tMobil, { dueDate: "2026-11-01" }))).toBe("403 KCA_FORBIDDEN");
    expect(await code(updateTask(db, access.ayse, ids.tAyse, { title: "Yeni ad" }))).toBe("403 KCA_FORBIDDEN");
    expect(await updateTask(db, access.ayse, ids.tAyse, { status: "doing", title: "Ayşe'nin işi" })).toEqual({ changed: ["status"] });
    expect(await code(updateTask(db, access.ayse, ids.tEdoras, { status: "doing" }))).toBe("403 KCA_FORBIDDEN");
    await updateTask(db, access.ayse, ids.tAyse, { status: "done" });
    expect(row<{ completed_at: string | null }>("SELECT completed_at FROM tasks WHERE id = ?", ids.tAyse).completed_at).not.toBeNull();
    const ev = fake.db.prepare("SELECT kind, old_value, new_value FROM task_events WHERE task_id = ? ORDER BY id").all(ids.tAyse);
    expect(ev).toEqual([
      { kind: "status", old_value: "todo", new_value: "doing" },
      { kind: "status", old_value: "doing", new_value: "done" },
    ]);
  });

  it("taşıma yalnız Edoras projeleri arasında; sorumlu hedefte üye değilse düşer", async () => {
    expect(await code(updateTask(db, access.kamil, ids.tEdoras, { projectId: ids.deepsport }))).toBe("404 NOT_FOUND");
    const { id } = await createTask(db, access.kamil, { projectId: ids.edoras, title: "Taşınacak", subject: null, description: null, assigneeId: ids.ayse, priority: "normal", dueDate: null, meetingId: null });
    expect((await updateTask(db, access.kamil, id, { projectId: ids.mobil })).changed).toEqual(["projectId", "assigneeId"]);
    expect(row<Record<string, unknown>>("SELECT project_id, assignee_id FROM tasks WHERE id = ?", id)).toEqual({ project_id: ids.mobil, assignee_id: null });
    const kinds = fake.db.prepare("SELECT kind, old_value, new_value FROM task_events WHERE task_id = ? AND kind != 'created' ORDER BY id").all(id);
    expect(kinds).toEqual([
      { kind: "project", old_value: "Edoras", new_value: "Edoras Mobil" },
      { kind: "assignee", old_value: String(ids.ayse), new_value: null },
    ]);
  });

  it("onay: yalnız 'Onay bekliyor' görev; OK → Tamamlandı, Düzeltme iste → Devam ediyor + not", async () => {
    expect(await code(approveTask(db, access.kamil, ids.tEdoras, null))).toBe("400 KCA_TASK_NOT_REVIEW");
    await requestTaskChanges(db, access.eren, ids.tMobil, "İkon eksik");
    expect(row<{ status: string }>("SELECT status FROM tasks WHERE id = ?", ids.tMobil).status).toBe("doing");
    expect(row<{ body: string }>("SELECT body FROM task_comments WHERE task_id = ? ORDER BY id DESC", ids.tMobil).body).toBe("Düzeltme istendi: İkon eksik");
    await updateTask(db, access.eren, ids.tMobil, { status: "review" });
    await approveTask(db, access.kamil, ids.tMobil, "Eline sağlık");
    expect(row<{ status: string; completed_at: string | null }>("SELECT status, completed_at FROM tasks WHERE id = ?", ids.tMobil).status).toBe("done");
    expect(row<{ kind: string }>("SELECT kind FROM task_events WHERE task_id = ? ORDER BY id DESC", ids.tMobil).kind).toBe("approved");
  });

  it("sil: görev girme yetkisi; yorum, geçmiş ve yıldız da gider", async () => {
    const { id } = await createTask(db, access.kamil, { projectId: ids.edoras, title: "Silinecek", subject: null, description: null, assigneeId: null, priority: "low", dueDate: null, meetingId: null });
    fake.db.prepare("INSERT INTO task_stars (user_id, task_id) VALUES (?, ?)").run(ids.kamil, id);
    expect(await code(deleteTask(db, access.ayse, id))).toBe("403 KCA_FORBIDDEN");
    await deleteTask(db, access.kamil, id);
    for (const t of ["tasks WHERE id", "task_events WHERE task_id", "task_stars WHERE task_id"]) {
      expect(row<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t} = ?`, id).n).toBe(0);
    }
  });
});

describe("toplantı notları", () => {
  const titles = async (a: KcaAccess) => (await listMeetings(db, a)).map((m) => m.title).sort();

  it("yalnız Edoras firmalı; sahibi görür, paylaşılanı proje ekibi görür; firmasız ve DeepSport hiç gelmez", async () => {
    expect(await titles(access.kamil)).toEqual(["Edoras yatırımcı", "Mobil sprint (paylaşılan)", "Mobil yol haritası"]);
    expect(await titles(access.eren)).toEqual(["Mobil sprint (paylaşılan)", "Mobil yol haritası", "Mobil özel"]);
    expect(await titles(access.ayse)).toEqual([]);
    for (const id of [ids.mKamilDeep, ids.mKamilNone, ids.mErenPrivate]) {
      expect(await code(meetingDetail(db, access.kamil, id))).toBe("404 NOT_FOUND");
    }
  });

  it("ayrıntıda çıkan görevler yalnız Edoras olanlar; görev sayısı da", async () => {
    const d = await meetingDetail(db, access.kamil, ids.mKamilEdoras);
    expect(d.meeting).toMatchObject({ isOwner: true, projectName: "Edoras", ownerName: "Kamil", taskCount: 1 });
    expect(d.tasks.map((t) => t.title)).toEqual(["Edoras sözleşmesi"]);
  });

  it("yeni not: #toplantı kodu atılır, başlık satırları okunur, gelecek tarih 'Planlanan', kaynak 'crm'", async () => {
    const body = "#toplantı\nTarih: 20.10.2026\nKonu: Vizyon Koleji görüşmesi\nKatılanlar: Abdülkadir, Ümit Abi\n\nNotlar:\n- Teklif";
    const { id } = await createMeeting(db, access.kamil, { body, projectId: ids.edoras, title: null, date: null, participants: null, status: null, shared: false, ai: true });
    const m = row<Record<string, unknown>>("SELECT * FROM meetings WHERE id = ?", id);
    expect(m).toMatchObject({
      owner_id: ids.kamil,
      project_id: ids.edoras,
      title: "Vizyon Koleji görüşmesi",
      meeting_date: "2026-10-20",
      participants: "Abdülkadir, Ümit Abi",
      status: "planned",
      shared: 0,
      ai: 1,
      source: "crm",
    });
    expect(String(m.body).startsWith("Tarih:")).toBe(true);
    expect(await code(createMeeting(db, access.kamil, { body: "x", projectId: ids.deepsport, title: null, date: null, participants: null, status: null, shared: false, ai: true }))).toBe("404 NOT_FOUND");
    expect(await code(createMeeting(db, access.eren, { body: "x", projectId: ids.edoras, title: null, date: null, participants: null, status: null, shared: false, ai: true }))).toBe("404 NOT_FOUND");
    expect(await code(createMeeting(db, access.kamil, { body: "#toplantı  ", projectId: ids.edoras, title: null, date: null, participants: null, status: null, shared: false, ai: true }))).toBe("400 VALIDATION");
  });

  it("düzenle / sil / işlendi yalnız sahibi; firma Edoras dışına taşınamaz", async () => {
    expect(await code(updateMeeting(db, access.kamil, ids.mErenShared, { title: "x" }))).toBe("403 KCA_NOT_OWNER");
    expect(await code(updateMeeting(db, access.kamil, ids.mKamilEdoras, { projectId: ids.deepsport }))).toBe("404 NOT_FOUND");
    expect(await updateMeeting(db, access.kamil, ids.mKamilEdoras, { shared: true, title: "Edoras yatırımcı" })).toEqual({ changed: ["title", "shared"] });
    expect(await titles(access.ayse)).toEqual(["Edoras yatırımcı"]);

    await setMeetingProcessed(db, access.kamil, ids.mKamilEdoras, true, "#12 açıldı", new Date("2026-10-14T08:00:00Z"));
    expect(row<Record<string, unknown>>("SELECT processed_at, processed_by, result FROM meetings WHERE id = ?", ids.mKamilEdoras)).toEqual({
      processed_at: "2026-10-14 08:00:00",
      processed_by: ids.kamil,
      result: "#12 açıldı",
    });
    expect(await code(setMeetingProcessed(db, access.eren, ids.mKamilMobilShared, true, null))).toBe("403 KCA_NOT_OWNER");

    expect(await code(deleteMeeting(db, access.ayse, ids.mKamilEdoras))).toBe("403 KCA_NOT_OWNER");
    await deleteMeeting(db, access.kamil, ids.mKamilEdoras);
    expect(row<{ meeting_id: number | null }>("SELECT meeting_id FROM tasks WHERE id = ?", ids.tEdoras).meeting_id).toBeNull();
    expect(row<{ meeting_id: number | null }>("SELECT meeting_id FROM tasks WHERE id = ?", ids.tDeep).meeting_id).toBeNull();
  });
});

describe("network", () => {
  it("yalnız kendi ve yalnız Edoras firmalı kişiler; yönetici dahil kimse başkasınınkini görmez", async () => {
    expect((await listContacts(db, access.kamil)).map((c) => c.name)).toEqual(["Okul Müdürü"]);
    expect((await listContacts(db, access.eren)).map((c) => c.name)).toEqual(["Eren'in Kişisi"]);
    expect(await listContacts(db, access.ayse)).toEqual([]);
    expect(await code(updateContact(db, access.kamil, ids.cErenEdoras, { name: "x" }))).toBe("404 NOT_FOUND");
    expect(await code(deleteContact(db, access.kamil, ids.cKamilDeep))).toBe("404 NOT_FOUND");
    expect(await code(updateContact(db, access.kamil, ids.cKamilNone, { projectId: ids.edoras }))).toBe("404 NOT_FOUND");
  });

  it("ekle / düzenle / sil; firma yalnız görülen Edoras projesi", async () => {
    const base = { name: "Abdülkadir", organization: "Vizyon Koleji", referral: "Ümit Abi", action: "Teklif ver", status: "todo" as const, nextDate: "2026-10-21", phone: null, email: null, notes: null };
    expect(await code(createContact(db, access.kamil, { ...base, projectId: ids.deepsport }))).toBe("404 NOT_FOUND");
    expect(await code(createContact(db, access.eren, { ...base, projectId: ids.edoras }))).toBe("404 NOT_FOUND");
    const { id } = await createContact(db, access.kamil, { ...base, projectId: ids.edoras });
    expect(row<Record<string, unknown>>("SELECT owner_id, project_id, name, referral, next_date, status, source FROM contacts WHERE id = ?", id)).toEqual({
      owner_id: ids.kamil,
      project_id: ids.edoras,
      name: "Abdülkadir",
      referral: "Ümit Abi",
      next_date: "2026-10-21",
      status: "todo",
      source: "Edoras CRM",
    });
    expect(await updateContact(db, access.kamil, id, { status: "followup", phone: null, projectId: ids.mobil })).toEqual({ changed: ["projectId", "status", "phone"] });
    expect(await code(updateContact(db, access.kamil, id, { projectId: ids.deepsport }))).toBe("404 NOT_FOUND");
    await deleteContact(db, access.kamil, id);
    expect(row<{ n: number }>("SELECT COUNT(*) AS n FROM contacts WHERE id = ?", id).n).toBe(0);
  });
});
