/**
 * Migration test düzeneği — PGlite (bellek içi gerçek Postgres). Supabase'in sağladığı roller ve
 * auth.users taklit edilir, sonra supabase/migrations altındaki TÜM dosyalar ad sırasıyla uygulanır:
 * her yeni migration öncekilerle birlikte test edilir. Hiçbir Supabase projesine dokunmaz.
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text);
`;

const MIGRATIONS_DIR = fileURLToPath(new URL("../migrations/", import.meta.url));

export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

export async function createTestDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  for (const file of migrationFiles()) {
    await db.exec(readFileSync(`${MIGRATIONS_DIR}${file}`, "utf8"));
  }
  return db;
}

export function helpers(db: PGlite) {
  return {
    async one<T>(sql: string, params: unknown[] = []): Promise<T> {
      const res = await db.query<T>(sql, params);
      return res.rows[0];
    },
    /** Hata mesajını (ya da CHECK kısıtının adını) döndürür; hata yoksa null. */
    async failure(sql: string, params: unknown[] = []): Promise<string | null> {
      try {
        await db.query(sql, params);
        return null;
      } catch (err) {
        const e = err as { message?: string; constraint?: string };
        return e.constraint ?? e.message ?? String(err);
      }
    },
    async newUser(email: string): Promise<string> {
      const res = await db.query<{ id: string }>("insert into auth.users (email) values ($1) returning id", [email]);
      return res.rows[0].id;
    },
  };
}
