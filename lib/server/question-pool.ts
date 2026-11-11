import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { HttpError, dbError, type StaffContext } from "@/lib/api/server";
import { isWellFormedBody, questionContentHash, type QuestionBody, type QuestionProgram } from "@/lib/domain/question-pool/rules";
import { matchPoolObjective, resolvePoolSubject } from "@/lib/domain/question-pool/objective-match";
import { OSYM_OBJECTIVE_MAP } from "@/lib/domain/question-pool/osym-objective-map";
import type { IngestBatchInput, QuestionDecisionInput } from "@/lib/domain/question-pool/schemas";
import { recordAudit } from "./audit";
import { createCompensator, type Compensator } from "./compensation";
import {
  deactivateEdorasMiniTestQuestion,
  findEdorasObjectiveCandidates,
  listEdorasActiveMiniTestQuestionIds,
  upsertEdorasMiniTestQuestion,
} from "./edoras";

export type PoolQuestion = {
  id: string;
  source: "AIG" | "LLM";
  program: QuestionProgram;
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

const POOL_COLUMNS = "id, source, program, subject, objective_code, model, run_date, body, created_at";

type PoolRow = {
  id: string;
  source: "AIG" | "LLM";
  program: QuestionProgram;
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
  program: row.program,
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
      program: item.program,
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

/** Onaylananlar, son onay önce. `inPanel`: soru Mini Test'te öğrenciye açık. */
export async function listApprovedQuestions(limit = 200): Promise<(PoolQuestion & { inPanel: boolean })[]> {
  const { data, error } = await getSupabaseAdminClient()
    .from("crm_question_pool")
    .select(POOL_COLUMNS)
    .eq("status", "APPROVED")
    .order("reviewed_at", { ascending: false })
    .limit(limit);
  if (error) throw dbError(error);
  const rows = (data ?? []) as PoolRow[];
  const active = await listEdorasActiveMiniTestQuestionIds(rows.map((row) => row.id));
  return rows.map((row) => ({ ...toDto(row), inPanel: active.has(row.id) }));
}

export type PanelTransfer = "transferred" | "ambiguous" | "not_found";

/**
 * Eşleşmeyen soru onaylı kalır ama panele gitmez. `meta` (dayanak soru, çeldirici kökenleri) panele HİÇ gitmez.
 * Sınav üreticiden gelir (`row.program`): adaylar onunla süzülür ve panele aynen yazılır; CRM sınavı tahmin etmez.
 */
async function transferToPanel(row: PoolRow): Promise<PanelTransfer> {
  const subject = resolvePoolSubject(row.subject, row.objective_code);
  if (!subject || !row.objective_code) return "not_found";
  // ÖSYM eşleme listesi yalnız YKS kodları içerir.
  const mappedId = row.program === "yks" ? OSYM_OBJECTIVE_MAP.get(row.objective_code) : undefined;
  const match = mappedId
    ? ({ kind: "matched", objectiveId: mappedId } as const)
    : matchPoolObjective(subject, await findEdorasObjectiveCandidates(row.objective_code), row.program);
  if (match.kind !== "matched") return match.kind;
  await upsertEdorasMiniTestQuestion({
    crm_question_id: row.id,
    objective_id: match.objectiveId,
    program: row.program,
    subject,
    stem: row.body.stem,
    options: row.body.options,
    answer_key: row.body.key,
    explanation: row.body.explanation,
  });
  return "transferred";
}

async function rollbackOrLog(compensator: Compensator, context: string): Promise<void> {
  const failed = await compensator.rollback();
  if (failed.length) console.error(`[question-pool] ${context}: geri alınamadı: ${failed.join(", ")}`);
}

/**
 * Onay/red. Yalnız bekleyen satır karar alır: ikinci karar 404 döner (yanlışlıkla çift tıklama ya da eski sekme).
 * Onayda soru panele de yazılır; panel yazımı düşerse CRM kararı geri alınır, iki veritabanı ayrışmaz.
 */
export async function decideQuestion(
  id: string,
  input: QuestionDecisionInput,
  staff: StaffContext
): Promise<PoolQuestion & { panelTransfer: PanelTransfer | null }> {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
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
  const row = data as PoolRow;

  let panelTransfer: PanelTransfer | null = null;
  if (input.decision === "APPROVED") {
    const compensator = createCompensator();
    compensator.push("onay", async () => {
      const { error: undoError } = await admin
        .from("crm_question_pool")
        .update({ status: "PENDING", reviewed_by: null, reviewed_at: null, review_note: null })
        .eq("id", id)
        .eq("status", "APPROVED");
      if (undoError) throw undoError;
    });
    try {
      panelTransfer = await transferToPanel(row);
    } catch (transferError) {
      await rollbackOrLog(compensator, id);
      throw transferError;
    }
  }

  await recordAudit(staff, {
    action: "QUESTION_DECIDED",
    entityType: "question",
    entityId: id,
    entityLabel: row.objective_code,
    details: { decision: input.decision, panelTransfer },
  });
  return { ...toDto(row), panelTransfer };
}

/** Onayı geri alır: soru kuyruğa döner, panelde pasifleşir (silinmez). Onaylı olmayan satır 404. */
export async function revokeQuestionApproval(id: string, staff: StaffContext): Promise<PoolQuestion> {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("crm_question_pool")
    .update({ status: "PENDING", reviewed_by: null, reviewed_at: null, review_note: null })
    .eq("id", id)
    .eq("status", "APPROVED")
    .select(POOL_COLUMNS)
    .maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new HttpError(404, "NOT_FOUND");
  const row = data as PoolRow;

  const compensator = createCompensator();
  compensator.push("onay geri alma", async () => {
    const { error: undoError } = await admin
      .from("crm_question_pool")
      .update({ status: "APPROVED", reviewed_by: staff.userId, reviewed_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "PENDING");
    if (undoError) throw undoError;
  });
  try {
    await deactivateEdorasMiniTestQuestion(id);
  } catch (panelError) {
    await rollbackOrLog(compensator, id);
    throw panelError;
  }

  await recordAudit(staff, {
    action: "QUESTION_APPROVAL_REVOKED",
    entityType: "question",
    entityId: id,
    entityLabel: row.objective_code,
  });
  return toDto(row);
}
