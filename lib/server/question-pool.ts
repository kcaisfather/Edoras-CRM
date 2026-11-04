import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { HttpError, dbError, type StaffContext } from "@/lib/api/server";
import { isWellFormedBody, questionContentHash, type QuestionBody } from "@/lib/domain/question-pool/rules";
import type { IngestBatchInput, QuestionDecisionInput } from "@/lib/domain/question-pool/schemas";

export type PoolQuestion = {
  id: string;
  source: "AIG" | "LLM";
  subject: string;
  objectiveCode: string | null;
  model: string;
  runDate: string;
  body: QuestionBody;
  createdAt: string;
};

export type IngestResult = {
  alreadyRun: boolean;
  inserted: number;
  skippedDuplicate: number;
  rejectedByCheck: number;
};

const POOL_COLUMNS = "id, source, subject, objective_code, model, run_date, body, created_at";

type PoolRow = {
  id: string;
  source: "AIG" | "LLM";
  subject: string;
  objective_code: string | null;
  model: string;
  run_date: string;
  body: QuestionBody;
  created_at: string;
};

const toDto = (row: PoolRow): PoolQuestion => ({
  id: row.id,
  source: row.source,
  subject: row.subject,
  objectiveCode: row.objective_code,
  model: row.model,
  runDate: row.run_date,
  body: row.body,
  createdAt: row.created_at,
});

/**
 * Gece partisini yazar. İdempotent: aynı (gece, kaynak) ikinci kez gelirse hiçbir şey yazılmaz (`alreadyRun`).
 * Çalışma satırı ÖNCE açılır; eşzamanlı iki çağrıda biri 23505 alır ve yazmaz — iki kez üretilen soru girmez.
 */
export async function ingestQuestionBatch(input: IngestBatchInput): Promise<IngestResult> {
  const admin = getSupabaseAdminClient();

  const { data: run, error: runError } = await admin
    .from("crm_question_pool_runs")
    .insert({ run_date: input.run_date, source: input.source, requested: input.requested })
    .select("id")
    .maybeSingle();
  if (runError) {
    if ((runError as { code?: string }).code === "23505") {
      return { alreadyRun: true, inserted: 0, skippedDuplicate: 0, rejectedByCheck: 0 };
    }
    throw dbError(runError);
  }

  const rowsByHash = new Map<string, Record<string, unknown>>();
  let rejectedByCheck = 0;
  for (const item of input.items) {
    if (item.source !== input.source || !isWellFormedBody(item.body)) {
      rejectedByCheck++;
      continue;
    }
    const hash = questionContentHash(item.source, item.subject, item.body);
    if (rowsByHash.has(hash)) continue;
    rowsByHash.set(hash, {
      source: item.source,
      subject: item.subject,
      objective_code: item.objective_code,
      model: item.model,
      run_date: input.run_date,
      body: item.body,
      content_hash: hash,
    });
  }

  const rows = [...rowsByHash.values()];
  let inserted = 0;
  if (rows.length) {
    const { data, error } = await admin
      .from("crm_question_pool")
      .upsert(rows, { onConflict: "content_hash", ignoreDuplicates: true })
      .select("id");
    if (error) {
      await admin.from("crm_question_pool_runs").update({ error_code: "INSERT_FAILED", finished_at: new Date().toISOString() }).eq("id", run?.id ?? "");
      throw dbError(error);
    }
    inserted = data?.length ?? 0;
  }

  const skippedDuplicate = rows.length - inserted;
  await admin
    .from("crm_question_pool_runs")
    .update({
      inserted,
      skipped_duplicate: skippedDuplicate,
      rejected_by_check: rejectedByCheck,
      finished_at: new Date().toISOString(),
    })
    .eq("id", run?.id ?? "");

  return { alreadyRun: false, inserted, skippedDuplicate, rejectedByCheck };
}

/** Onay kuyruğu: bekleyen sorular, en yeni önce. */
export async function listPendingQuestions(limit = 200): Promise<PoolQuestion[]> {
  const { data, error } = await getSupabaseAdminClient()
    .from("crm_question_pool")
    .select(POOL_COLUMNS)
    .eq("status", "PENDING")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw dbError(error);
  return ((data ?? []) as PoolRow[]).map(toDto);
}

/**
 * Onay/red. Yalnız bekleyen satır karar alır: ikinci karar 404 döner (yanlışlıkla çift tıklama ya da eski sekme).
 */
export async function decideQuestion(id: string, input: QuestionDecisionInput, staff: StaffContext): Promise<PoolQuestion> {
  const { data, error } = await getSupabaseAdminClient()
    .from("crm_question_pool")
    .update({
      status: input.decision,
      reviewed_by: staff.userId,
      reviewed_at: new Date().toISOString(),
      review_note: input.review_note,
    })
    .eq("id", id)
    .eq("status", "PENDING")
    .select(POOL_COLUMNS)
    .maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new HttpError(404, "NOT_FOUND");
  return toDto(data as PoolRow);
}
