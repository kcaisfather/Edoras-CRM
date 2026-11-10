/** 20261110120000_crm_flashcard_pool — bilgi kartı deste havuzu ve gece çalışma kaydı (PGlite, düzenek harness.ts). */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, helpers } from "./harness";

let db: PGlite;
const h = () => helpers(db);
let admin: string;

beforeAll(async () => {
  db = await createTestDb();
  admin = await h().newUser("admin@example.com");
}, 60_000);

afterAll(async () => {
  await db?.close();
});

const INSERT =
  "insert into crm_flashcard_decks (objective_id, subject, model, run_date, cards, content_hash) values ($1, $2, $3, $4, $5::jsonb, $6)";

const CARDS = JSON.stringify([
  { id: "00000000-0000-4000-8000-000000000001", front: "Ön", back: "Arka" },
]);

describe("crm_flashcard_decks", () => {
  it("bekleyen deste girilir", async () => {
    await db.query(INSERT, [42, "Biyoloji", "claude-haiku-5-5", "2026-11-10", CARDS, "d-1"]);
    const row = await h().one<{ n: number }>("select count(*)::int as n from crm_flashcard_decks where status = 'PENDING'");
    expect(row.n).toBe(1);
  });

  it("aynı içerik ikinci kez girilmez", async () => {
    await expect(db.query(INSERT, [42, "Biyoloji", "m", "2026-11-11", CARDS, "d-1"])).rejects.toThrow();
  });

  it("kazanım kimliği pozitif olmalı", async () => {
    await expect(db.query(INSERT, [0, "Biyoloji", "m", "2026-11-10", CARDS, "d-zero"])).rejects.toThrow();
  });

  it("kartlar dizi olmalı ve boş olamaz", async () => {
    await expect(db.query(INSERT, [42, "Biyoloji", "m", "2026-11-10", "{}", "d-obj"])).rejects.toThrow();
    await expect(db.query(INSERT, [42, "Biyoloji", "m", "2026-11-10", "[]", "d-empty"])).rejects.toThrow();
  });

  it("onaylı deste karar veren ve tarih olmadan girilemez", async () => {
    await expect(
      db.query(
        "insert into crm_flashcard_decks (objective_id, subject, model, run_date, cards, content_hash, status) values (1, 'Fizik', 'm', '2026-11-10', $1::jsonb, 'd-appr', 'APPROVED')",
        [CARDS],
      ),
    ).rejects.toThrow();
    await db.query(
      "insert into crm_flashcard_decks (objective_id, subject, model, run_date, cards, content_hash, status, reviewed_by, reviewed_at) values (1, 'Fizik', 'm', '2026-11-10', $1::jsonb, 'd-appr-ok', 'APPROVED', $2, now())",
      [CARDS, admin],
    );
  });
});

describe("crm_flashcard_runs", () => {
  it("aynı gece ikinci çalışma girilmez", async () => {
    await db.query("insert into crm_flashcard_runs (run_date, requested) values ('2026-11-10', 20)");
    await expect(db.query("insert into crm_flashcard_runs (run_date, requested) values ('2026-11-10', 5)")).rejects.toThrow();
  });
});

describe("crm_flashcard_declines", () => {
  it("kazanım başına tek ret satırı", async () => {
    await db.query("insert into crm_flashcard_declines (objective_id, reason, run_date) values (7, 'bölüm konuyu anlatmıyor', '2026-11-10')");
    await expect(
      db.query("insert into crm_flashcard_declines (objective_id, run_date) values (7, '2026-11-11')"),
    ).rejects.toThrow();
  });

  it("kazanım kimliği pozitif, gerekçe en çok 300 karakter", async () => {
    await expect(db.query("insert into crm_flashcard_declines (objective_id, run_date) values (0, '2026-11-10')")).rejects.toThrow();
    await expect(
      db.query("insert into crm_flashcard_declines (objective_id, reason, run_date) values (8, $1, '2026-11-10')", ["x".repeat(301)]),
    ).rejects.toThrow();
  });
});

describe("güvenlik", () => {
  it("RLS açık, politika yok", async () => {
    const rows = await db.query<{ relname: string; relrowsecurity: boolean }>(
      "select relname, relrowsecurity from pg_class where relname in ('crm_flashcard_decks', 'crm_flashcard_runs', 'crm_flashcard_declines') order by relname",
    );
    expect(rows.rows).toHaveLength(3);
    expect(rows.rows.every((r) => r.relrowsecurity)).toBe(true);
    const policies = await h().one<{ n: number }>(
      "select count(*)::int as n from pg_policies where tablename in ('crm_flashcard_decks', 'crm_flashcard_runs', 'crm_flashcard_declines')",
    );
    expect(policies.n).toBe(0);
  });
});
