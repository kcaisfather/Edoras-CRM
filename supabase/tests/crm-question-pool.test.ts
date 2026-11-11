/** 20261104120000_crm_question_pool — soru havuzu ve gece çalışma kaydı (PGlite, düzenek harness.ts). */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, helpers } from "./harness";

let db: PGlite;
const h = () => helpers(db);
let admin: string;

beforeAll(async () => {
  db = await createTestDb();
  admin = await h().newUser("admin@example.com");
  await db.query(
    "insert into crm_staff (user_id, role, full_name, is_active) values ($1, 'ADMIN', 'Yönetici', true)",
    [admin],
  );
}, 60_000);

afterAll(async () => {
  await db?.close();
});

const INSERT =
  "insert into crm_question_pool (source, subject, objective_code, model, run_date, body, content_hash, program) values ($1, $2, $3, $4, $5, $6::jsonb, $7, 'yks')";

const BODY = JSON.stringify({ stem: "Örnek soru", options: ["A", "B", "C", "D", "E"], key: "C" });

describe("crm_question_pool", () => {
  it("bekleyen AIG ve LLM sorusu girilir", async () => {
    await db.query(INSERT, ["AIG", "Matematik", "MAT.1.1", "aig-kalip-1", "2026-11-04", BODY, "h-aig-1"]);
    await db.query(INSERT, ["LLM", "Fizik", null, "gpt-4o-mini", "2026-11-04", BODY, "h-llm-1"]);
    const row = await h().one<{ n: number }>("select count(*)::int as n from crm_question_pool where status = 'PENDING'");
    expect(row.n).toBe(2);
  });

  it("program zorunlu ve yalnız yks | lgs (20261111120000)", async () => {
    const NO_PROGRAM =
      "insert into crm_question_pool (source, subject, model, run_date, body, content_hash) values ('LLM', 'Fizik', 'm', '2026-11-11', $1::jsonb, 'h-no-program')";
    await expect(db.query(NO_PROGRAM, [BODY])).rejects.toThrow();
    const BAD_PROGRAM =
      "insert into crm_question_pool (source, subject, model, run_date, body, content_hash, program) values ('LLM', 'Fizik', 'm', '2026-11-11', $1::jsonb, 'h-bad-program', 'tyt')";
    await expect(db.query(BAD_PROGRAM, [BODY])).rejects.toThrow();
    const LGS =
      "insert into crm_question_pool (source, subject, model, run_date, body, content_hash, program) values ('LLM', 'Matematik', 'm', '2026-11-11', $1::jsonb, 'h-lgs', 'lgs') returning program";
    const row = await db.query<{ program: string }>(LGS, [BODY]);
    expect(row.rows[0].program).toBe("lgs");
  });

  it("aynı içerik ikinci kez girilmez", async () => {
    await expect(
      db.query(INSERT, ["AIG", "Matematik", "MAT.1.1", "aig-kalip-1", "2026-11-05", BODY, "h-aig-1"]),
    ).rejects.toThrow();
  });

  it("bilinmeyen kaynak reddedilir", async () => {
    await expect(
      db.query(INSERT, ["HUMAN", "Matematik", null, "x", "2026-11-04", BODY, "h-bad-src"]),
    ).rejects.toThrow();
  });

  it("boş ders reddedilir", async () => {
    await expect(db.query(INSERT, ["AIG", "", null, "x", "2026-11-04", BODY, "h-bad-subj"])).rejects.toThrow();
  });

  it("onaylı satır karar veren ve tarih olmadan girilemez", async () => {
    await expect(
      db.query(
        "insert into crm_question_pool (source, subject, model, run_date, body, content_hash, status, program) values ('AIG', 'Fizik', 'm', '2026-11-04', $1::jsonb, 'h-appr-noreviewer', 'APPROVED', 'yks')",
        [BODY],
      ),
    ).rejects.toThrow();
  });

  it("bekleyen satıra karar bilgisi yazılamaz", async () => {
    await expect(
      db.query(
        "insert into crm_question_pool (source, subject, model, run_date, body, content_hash, status, reviewed_by, reviewed_at, program) values ('AIG', 'Fizik', 'm', '2026-11-04', $1::jsonb, 'h-pend-reviewed', 'PENDING', $2, now(), 'yks')",
        [BODY, admin],
      ),
    ).rejects.toThrow();
  });

  it("yönetici onayı kaydedilir", async () => {
    await db.query(
      "update crm_question_pool set status = 'APPROVED', reviewed_by = $1, reviewed_at = now() where content_hash = 'h-aig-1'",
      [admin],
    );
    const row = await h().one<{ status: string }>("select status from crm_question_pool where content_hash = 'h-aig-1'");
    expect(row.status).toBe("APPROVED");
  });

  it("onay geri alınınca karar bilgisi temizlenmeden kuyruğa dönemez", async () => {
    await expect(
      db.query("update crm_question_pool set status = 'PENDING' where content_hash = 'h-aig-1'"),
    ).rejects.toThrow();
    await db.query(
      "update crm_question_pool set status = 'PENDING', reviewed_by = null, reviewed_at = null, review_note = null where content_hash = 'h-aig-1'",
    );
    const row = await h().one<{ status: string }>("select status from crm_question_pool where content_hash = 'h-aig-1'");
    expect(row.status).toBe("PENDING");
  });

  it("gece çalışması kaynak başına bir kez kaydedilir", async () => {
    const RUN = "insert into crm_question_pool_runs (run_date, source, requested) values ($1, $2, 20)";
    await db.query(RUN, ["2026-11-04", "AIG"]);
    await db.query(RUN, ["2026-11-04", "LLM"]);
    await expect(db.query(RUN, ["2026-11-04", "AIG"])).rejects.toThrow();
  });

  it("negatif sayım reddedilir", async () => {
    await expect(
      db.query("insert into crm_question_pool_runs (run_date, source, requested) values ('2026-11-06', 'AIG', -1)"),
    ).rejects.toThrow();
  });
});
