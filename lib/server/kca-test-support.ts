/**
 * YALNIZ TESTLER: KCA Panel'in Turso veritabanının bellek içi taklidi. KCA Panel şeması (kcaisfather/KCAPanel
 * lib/schema.js, 2026-10-14) Node'un yerleşik SQLite'ına kurulur; `fetch` Hrana v2 `/v2/pipeline` isteklerini bu
 * veritabanında çalıştırır — kca-turso.ts'in HTTP istemcisi gerçek protokolle uçtan uca denenir.
 */
import { scryptSync, randomBytes } from "node:crypto";
import { createRequire } from "node:module";

/** node:sqlite (Node 22+); @types/node 20 tanımını içermediği için en dar arayüzle require edilir. */
interface SqliteStatement {
  all(...params: unknown[]): unknown[];
  run(...params: unknown[]): { changes: number | bigint };
  columns(): { name: string }[];
}
interface SqliteDb {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
}
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as { DatabaseSync: new (path: string) => SqliteDb };

export const KCA_SCHEMA = [
  `CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE, title TEXT,
    password_hash TEXT NOT NULL, is_admin INTEGER NOT NULL DEFAULT 0, can_create_projects INTEGER NOT NULL DEFAULT 0,
    can_manage_users INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, is_agent INTEGER NOT NULL DEFAULT 0, agent_role TEXT,
    phone TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
  `CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT, color TEXT NOT NULL DEFAULT '#3b6fd8',
    parent_id INTEGER, archived INTEGER NOT NULL DEFAULT 0, created_by INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
  `CREATE TABLE project_members (project_id INTEGER NOT NULL, user_id INTEGER NOT NULL, can_create_tasks INTEGER NOT NULL DEFAULT 0,
    can_edit_due_dates INTEGER NOT NULL DEFAULT 0, can_manage_members INTEGER NOT NULL DEFAULT 0,
    added_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (project_id, user_id))`,
  `CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, subject TEXT, title TEXT NOT NULL, description TEXT,
    assignee_id INTEGER, status TEXT NOT NULL DEFAULT 'todo', priority TEXT NOT NULL DEFAULT 'normal', due_date TEXT, meeting_id INTEGER,
    created_by INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), completed_at TEXT)`,
  `CREATE TABLE task_stars (user_id INTEGER NOT NULL, task_id INTEGER NOT NULL, starred_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, task_id))`,
  `CREATE TABLE task_comments (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER NOT NULL, user_id INTEGER, body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
  `CREATE TABLE task_events (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER NOT NULL, user_id INTEGER, kind TEXT NOT NULL,
    old_value TEXT, new_value TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
  `CREATE TABLE meetings (id INTEGER PRIMARY KEY AUTOINCREMENT, owner_id INTEGER NOT NULL, project_id INTEGER, title TEXT NOT NULL,
    meeting_date TEXT NOT NULL, participants TEXT, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'held', shared INTEGER NOT NULL DEFAULT 0,
    ai INTEGER NOT NULL DEFAULT 1, source TEXT, processed_at TEXT, processed_by INTEGER, result TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')))`,
  `CREATE TABLE contacts (id INTEGER PRIMARY KEY AUTOINCREMENT, owner_id INTEGER NOT NULL, name TEXT NOT NULL, organization TEXT, referral TEXT,
    project_id INTEGER, action TEXT, status TEXT NOT NULL DEFAULT 'todo', next_date TEXT, phone TEXT, email TEXT, notes TEXT, source TEXT,
    task_id INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')))`,
  `CREATE TABLE login_attempts (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL, at INTEGER NOT NULL)`,
];

/** KCA Panel lib/auth.js hashPassword ile aynı biçim (testte hızlı olsun diye aynı parametreler; bir kez hesaplanır). */
export function kcaHashPassword(password: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

type Hrana = { type: string; value?: string | number; base64?: string };

function fromArg(a: Hrana): string | number | null {
  if (a.type === "null") return null;
  if (a.type === "integer") return Number(a.value);
  if (a.type === "float") return Number(a.value);
  return String(a.value);
}

function toValue(v: unknown): Hrana {
  if (v === null || v === undefined) return { type: "null" };
  if (typeof v === "bigint") return { type: "integer", value: String(v) };
  if (typeof v === "number") return Number.isInteger(v) ? { type: "integer", value: String(v) } : { type: "float", value: v };
  return { type: "text", value: String(v) };
}

export interface FakeTurso {
  db: SqliteDb;
  fetch: typeof fetch;
  /** Gelen isteklerin SQL'leri (sıralı). */
  statements: string[];
  /** Bir sonraki isteği bu HTTP durumuyla düşür. */
  failNext: (status: number) => void;
}

/** Bellek içi KCA Panel veritabanı + Hrana HTTP taklidi. */
export function createFakeTurso(): FakeTurso {
  const db = new DatabaseSync(":memory:");
  for (const sql of KCA_SCHEMA) db.exec(sql);
  const statements: string[] = [];
  let failStatus: number | null = null;

  const fakeFetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    if (failStatus !== null) {
      const status = failStatus;
      failStatus = null;
      return new Response("hata", { status });
    }
    const body = JSON.parse(String(init?.body ?? "{}")) as { requests: { type: string; stmt?: { sql: string; args: Hrana[] } }[] };
    const results = body.requests.map((r) => {
      if (r.type === "close") return { type: "ok", response: { type: "close" } };
      const { sql, args } = r.stmt!;
      statements.push(sql);
      try {
        const st = db.prepare(sql);
        const params = args.map(fromArg);
        const reads = /^\s*(select|with|pragma)/i.test(sql) || /\breturning\b/i.test(sql);
        const cols = reads ? st.columns().map((c) => ({ name: c.name })) : [];
        if (reads) {
          const rows = st.all(...params) as Record<string, unknown>[];
          return {
            type: "ok",
            response: { type: "execute", result: { cols, rows: rows.map((row) => cols.map((c) => toValue(row[c.name]))), affected_row_count: 0 } },
          };
        }
        const info = st.run(...params);
        return { type: "ok", response: { type: "execute", result: { cols: [], rows: [], affected_row_count: Number(info.changes) } } };
      } catch (err) {
        return { type: "error", error: { message: (err as Error).message } };
      }
    });
    return new Response(JSON.stringify({ baton: null, base_url: null, results }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  return {
    db,
    fetch: fakeFetch,
    statements,
    failNext: (status) => {
      failStatus = status;
    },
  };
}
