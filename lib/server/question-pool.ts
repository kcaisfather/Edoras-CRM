import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { HttpError, dbError, type StaffContext } from "@/lib/api/server";
import { isWellFormedBody, questionContentHash, type QuestionBody, type QuestionProgram } from "@/lib/domain/question-pool/rules";
import { matchPoolObjective, resolvePoolSubject } from "@/lib/domain/question-pool/objective-match";
import { OSYM_OBJECTIVE_MAP } from "@/lib/domain/question-pool/osym-objective-map";
import type { IngestBatchInput, QuestionDecisionInput } from "@/lib/domain/question-pool/schemas";
import {
  autoAction,
  autoRejectNote,
  readAutoDecisionFlags,
  type AiFilter,
  type AiReviewBatch,
  type AiVerdict,
  type AutoDecisionFlags,
} from "@/lib/domain/ai-review/rules";
import { recordAudit, recordSystemAudit } from "./audit";
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
  aiVerdict: AiVerdict | null;
  aiConfidence: number | null;
  aiReason: string | null;
  autoReviewed: boolean;
};

export type IngestResult = {
  alreadyRun: boolean;
  inserted: number;
  skippedDuplicate: number;
  rejectedByCheck: number;
};

const POOL_COLUMNS =
  "id, source, program, subject, objective_code, model, run_date, body, created_at, ai_verdict, ai_confidence, ai_reason, auto_reviewed";

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
  ai_verdict: AiVerdict | null;
  ai_confidence: number | null;
  ai_reason: string | null;
  auto_reviewed: boolean;
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
  aiVerdict: row.ai_verdict,
  aiConfidence: row.ai_confidence,
  aiReason: row.ai_reason,
  autoReviewed: row.auto_reviewed,
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
export async function listPendingQuestions(limit = 200, ai?: AiFilter): Promise<PoolQuestion[]> {
  let query = getSupabaseAdminClient().from("crm_question_pool").select(POOL_COLUMNS).eq("status", "PENDING");
  if (ai === "NONE") query = query.is("ai_verdict", null);
  else if (ai) query = query.eq("ai_verdict", ai);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(limit);
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
  return decideCore(id, input, { kind: "staff", staff });
}

/** Karar veren: insan (CRM yöneticisi) ya da gece ön incelemesi (Haiku; `reviewed_by` boş, `auto_reviewed` true). */
type Actor = { kind: "staff"; staff: StaffContext } | { kind: "ai"; model: string };

async function decideCore(
  id: string,
  input: QuestionDecisionInput,
  actor: Actor
): Promise<PoolQuestion & { panelTransfer: PanelTransfer | null }> {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("crm_question_pool")
    .update({
      status: input.decision,
      reviewed_by: actor.kind === "staff" ? actor.staff.userId : null,
      auto_reviewed: actor.kind === "ai",
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
        .update({ status: "PENDING", reviewed_by: null, auto_reviewed: false, reviewed_at: null, review_note: null })
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

  const entry = {
    action: "QUESTION_DECIDED",
    entityType: "question",
    entityId: id,
    entityLabel: row.objective_code,
    details: { decision: input.decision, panelTransfer },
  } as const;
  if (actor.kind === "staff") await recordAudit(actor.staff, entry);
  else await recordSystemAudit({ ...entry, details: { ...entry.details, auto: true, model: actor.model } }, "Haiku ön inceleme");
  return { ...toDto(row), panelTransfer };
}

/** Onayı geri alır: soru kuyruğa döner, panelde pasifleşir (silinmez). Onaylı olmayan satır 404. */
export async function revokeQuestionApproval(id: string, staff: StaffContext): Promise<PoolQuestion> {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("crm_question_pool")
    .update({ status: "PENDING", reviewed_by: null, auto_reviewed: false, reviewed_at: null, review_note: null })
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

// ---------------------------------------------------------------------------------------------------------------------
// Gece ön incelemesi (Haiku). Gece işi denetlenmemiş bekleyenleri çeker, sonucu yazar. Bayraklar kapalıyken yalnız rozet.
// ---------------------------------------------------------------------------------------------------------------------

export type AiQuestionTodo = {
  id: string;
  source: "AIG" | "LLM";
  program: QuestionProgram;
  subject: string;
  objectiveCode: string | null;
  body: QuestionBody;
};

type TodoRow = Pick<PoolRow, "id" | "source" | "program" | "subject" | "objective_code" | "body">;

/** Henüz denetlenmemiş bekleyen sorular (en eski önce: kuyruk sırasıyla erir). `meta` kazanım metni için yeter. */
export async function listQuestionsForAiReview(limit = 100): Promise<AiQuestionTodo[]> {
  const { data, error } = await getSupabaseAdminClient()
    .from("crm_question_pool")
    .select("id, source, program, subject, objective_code, body")
    .eq("status", "PENDING")
    .is("ai_reviewed_at", null)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw dbError(error);
  return ((data ?? []) as TodoRow[]).map((row) => ({
    id: row.id,
    source: row.source,
    program: row.program,
    subject: row.subject,
    objectiveCode: row.objective_code,
    body: row.body,
  }));
}

export type AiReviewResult = {
  reviewed: number;
  skipped: number;
  autoApproved: number;
  autoRejected: number;
  approveNotTransferred: number;
  failed: number;
};

/** Onaylanan ama panele geçmeyen (eşleşmeyen kazanım) soru insanda kalmalı: otomatik onay geri alınır. */
async function undoAutoApproval(id: string): Promise<void> {
  const { error } = await getSupabaseAdminClient()
    .from("crm_question_pool")
    .update({ status: "PENDING", reviewed_by: null, auto_reviewed: false, reviewed_at: null, review_note: null })
    .eq("id", id)
    .eq("status", "APPROVED");
  if (error) throw error;
}

export async function applyQuestionAiReviews(
  batch: AiReviewBatch,
  flags: AutoDecisionFlags = readAutoDecisionFlags(process.env)
): Promise<AiReviewResult> {
  const admin = getSupabaseAdminClient();
  const result: AiReviewResult = { reviewed: 0, skipped: 0, autoApproved: 0, autoRejected: 0, approveNotTransferred: 0, failed: 0 };
  for (const item of batch.results) {
    try {
      const { data, error } = await admin
        .from("crm_question_pool")
        .update({
          ai_verdict: item.verdict,
          ai_confidence: item.confidence,
          ai_reason: item.reason,
          ai_model: batch.model,
          ai_reviewed_at: new Date().toISOString(),
        })
        .eq("id", item.id)
        .eq("status", "PENDING")
        .is("ai_reviewed_at", null)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        result.skipped++;
        continue;
      }
      result.reviewed++;
      const action = autoAction(item, flags);
      if (action === "reject") {
        await decideCore(item.id, { decision: "REJECTED", review_note: autoRejectNote(item.reason) }, { kind: "ai", model: batch.model });
        result.autoRejected++;
      } else if (action === "approve") {
        const decided = await decideCore(item.id, { decision: "APPROVED", review_note: null }, { kind: "ai", model: batch.model });
        if (decided.panelTransfer === "transferred") result.autoApproved++;
        else {
          await undoAutoApproval(item.id);
          result.approveNotTransferred++;
        }
      }
    } catch (itemError) {
      console.error(`[question-pool] ön inceleme yazılamadı: ${item.id}`, itemError);
      result.failed++;
    }
  }
  return result;
}
