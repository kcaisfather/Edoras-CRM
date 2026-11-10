import "server-only";

import { randomUUID } from "node:crypto";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { HttpError, dbError, type StaffContext } from "@/lib/api/server";
import {
  FLASHCARD_MIN_CARDS,
  deckContentHash,
  hasDuplicateFronts,
  keptCards,
  type FlashcardCard,
} from "@/lib/domain/flashcard-pool/rules";
import type { FlashcardDecisionInput, FlashcardIngestBatchInput } from "@/lib/domain/flashcard-pool/schemas";
import { recordAudit } from "./audit";
import { createCompensator, type Compensator } from "./compensation";
import {
  deactivateEdorasFlashcards,
  edorasObjectiveExists,
  listEdorasActiveFlashcardIds,
  upsertEdorasFlashcards,
} from "./edoras";

export type FlashcardSourceRef = {
  book?: string | null;
  pages?: number[];
  book_sha256?: string | null;
  section_title?: string | null;
};

export type PoolDeck = {
  id: string;
  objectiveId: number;
  objectiveCode: string | null;
  objectiveText: string | null;
  subject: string;
  model: string;
  runDate: string;
  cards: FlashcardCard[];
  excludedCardIds: string[];
  sourceRef: FlashcardSourceRef;
  createdAt: string;
};

export type FlashcardIngestResult = {
  alreadyRun: boolean;
  inserted: number;
  skippedDuplicate: number;
  rejectedByCheck: number;
  declined: number;
};

const DECK_COLUMNS =
  "id, objective_id, objective_code, objective_text, subject, model, run_date, cards, excluded_card_ids, source_ref, created_at";

type DeckRow = {
  id: string;
  objective_id: number;
  objective_code: string | null;
  objective_text: string | null;
  subject: string;
  model: string;
  run_date: string;
  cards: FlashcardCard[];
  excluded_card_ids: string[];
  source_ref: FlashcardSourceRef;
  created_at: string;
};

const toDto = (row: DeckRow): PoolDeck => ({
  id: row.id,
  objectiveId: row.objective_id,
  objectiveCode: row.objective_code,
  objectiveText: row.objective_text,
  subject: row.subject,
  model: row.model,
  runDate: row.run_date,
  cards: row.cards,
  excludedCardIds: row.excluded_card_ids,
  sourceRef: row.source_ref,
  createdAt: row.created_at,
});

/**
 * Gece partisini yazar. İdempotent: aynı gece ikinci kez gelirse hiçbir şey yazılmaz (`alreadyRun`).
 * En az 4 kartı olmayan ya da aynı ön yüzü iki kez içeren deste girmez (`rejectedByCheck`).
 */
export async function ingestFlashcardBatch(input: FlashcardIngestBatchInput): Promise<FlashcardIngestResult> {
  const admin = getSupabaseAdminClient();

  const { data: run, error: runError } = await admin
    .from("crm_flashcard_runs")
    .insert({ run_date: input.run_date, requested: input.requested })
    .select("id")
    .maybeSingle();
  if (runError) {
    if ((runError as { code?: string }).code === "23505") {
      return { alreadyRun: true, inserted: 0, skippedDuplicate: 0, rejectedByCheck: 0, declined: 0 };
    }
    throw dbError(runError);
  }

  const rowsByHash = new Map<string, Record<string, unknown>>();
  let rejectedByCheck = 0;
  for (const item of input.items) {
    if (item.cards.length < FLASHCARD_MIN_CARDS || hasDuplicateFronts(item.cards)) {
      rejectedByCheck++;
      continue;
    }
    const hash = deckContentHash(item.objective_id, item.cards);
    if (rowsByHash.has(hash)) continue;
    rowsByHash.set(hash, {
      objective_id: item.objective_id,
      objective_code: item.objective_code,
      objective_text: item.objective_text,
      subject: item.subject,
      model: item.model,
      run_date: input.run_date,
      cards: item.cards.map((card) => ({ id: randomUUID(), front: card.front, back: card.back })),
      source_ref: item.source_ref ?? {},
      content_hash: hash,
    });
  }

  const rows = [...rowsByHash.values()];
  let inserted = 0;
  if (rows.length) {
    const { data, error } = await admin
      .from("crm_flashcard_decks")
      .upsert(rows, { onConflict: "content_hash", ignoreDuplicates: true })
      .select("id");
    if (error) {
      await admin
        .from("crm_flashcard_runs")
        .update({ error_code: "INSERT_FAILED", finished_at: new Date().toISOString() })
        .eq("id", run?.id ?? "");
      throw dbError(error);
    }
    inserted = data?.length ?? 0;
  }

  // Kartsız kalan kazanımlar: ilk ret kalır (yeniden denemek için satır elle silinir).
  const declineRows = [...new Map(input.declined.map((d) => [d.objective_id, d])).values()].map((d) => ({
    objective_id: d.objective_id,
    reason: d.reason,
    run_date: input.run_date,
  }));
  let declined = 0;
  if (declineRows.length) {
    const { data, error } = await admin
      .from("crm_flashcard_declines")
      .upsert(declineRows, { onConflict: "objective_id", ignoreDuplicates: true })
      .select("objective_id");
    if (error) throw dbError(error);
    declined = data?.length ?? 0;
  }

  await admin
    .from("crm_flashcard_runs")
    .update({
      inserted,
      skipped_duplicate: rows.length - inserted,
      rejected_by_check: rejectedByCheck,
      finished_at: new Date().toISOString(),
    })
    .eq("id", run?.id ?? "");

  return { alreadyRun: false, inserted, skippedDuplicate: rows.length - inserted, rejectedByCheck, declined };
}

/**
 * Gece işinin yeniden üretmeyeceği kazanımlar: destesi olan (bekleyen, onaylı ya da reddedilmiş) ve kartsız kalanlar.
 * Yalnız kimlikler döner (metin ya da kart yok).
 */
export async function listCoveredObjectiveIds(): Promise<number[]> {
  const admin = getSupabaseAdminClient();
  const [decks, declines] = await Promise.all([
    fetchAllObjectiveIds(admin, "crm_flashcard_decks"),
    fetchAllObjectiveIds(admin, "crm_flashcard_declines"),
  ]);
  return [...new Set([...decks, ...declines])].sort((a, b) => a - b);
}

const PAGE = 1000;

async function fetchAllObjectiveIds(
  admin: ReturnType<typeof getSupabaseAdminClient>,
  table: "crm_flashcard_decks" | "crm_flashcard_declines",
): Promise<number[]> {
  const ids: number[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from(table)
      .select("objective_id")
      .order("objective_id")
      .range(from, from + PAGE - 1);
    if (error) throw dbError(error);
    ids.push(...(data ?? []).map((r: { objective_id: number }) => r.objective_id));
    if (!data || data.length < PAGE) return ids;
  }
}

/** Onay kuyruğu: bekleyen desteler, en yeni önce. */
export async function listPendingDecks(limit = 100): Promise<PoolDeck[]> {
  const { data, error } = await getSupabaseAdminClient()
    .from("crm_flashcard_decks")
    .select(DECK_COLUMNS)
    .eq("status", "PENDING")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw dbError(error);
  return ((data ?? []) as DeckRow[]).map(toDto);
}

/** Onaylananlar, son onay önce. `inPanel`: destenin en az bir kartı panelde öğrenciye açık. */
export async function listApprovedDecks(limit = 100): Promise<(PoolDeck & { inPanel: boolean })[]> {
  const { data, error } = await getSupabaseAdminClient()
    .from("crm_flashcard_decks")
    .select(DECK_COLUMNS)
    .eq("status", "APPROVED")
    .order("reviewed_at", { ascending: false })
    .limit(limit);
  if (error) throw dbError(error);
  const rows = (data ?? []) as DeckRow[];
  const active = await listEdorasActiveFlashcardIds(rows.flatMap((row) => row.cards.map((card) => card.id)));
  return rows.map((row) => ({ ...toDto(row), inPanel: row.cards.some((card) => active.has(card.id)) }));
}

export type DeckPanelTransfer = "transferred" | "not_found";

/** Kazanım panelde yoksa deste onaylı kalır ama panele gitmez. Çıkarılan kartlar panelde pasifleşir. */
async function transferDeckToPanel(row: DeckRow): Promise<DeckPanelTransfer> {
  if (!(await edorasObjectiveExists(row.objective_id))) return "not_found";
  const kept = keptCards(row.cards, row.excluded_card_ids);
  await upsertEdorasFlashcards(
    kept.map((card, index) => ({
      crm_card_id: card.id,
      objective_id: row.objective_id,
      subject: row.subject,
      front: card.front,
      back: card.back,
      sort_order: index,
    })),
  );
  // Önceki bir onayda açılmış ama bu onayda çıkarılmış kartlar öğrenciye gitmesin.
  await deactivateEdorasFlashcards(row.excluded_card_ids);
  return "transferred";
}

async function rollbackOrLog(compensator: Compensator, context: string): Promise<void> {
  const failed = await compensator.rollback();
  if (failed.length) console.error(`[flashcard-pool] ${context}: geri alınamadı: ${failed.join(", ")}`);
}

/**
 * Onay/red. Yalnız bekleyen deste karar alır: ikinci karar 404. Onayda yönetici bazı kartları çıkarabilir; kalan kart
 * en az 4 olmalı (409). Onaylanan kartlar panele yazılır; panel yazımı düşerse CRM kararı geri alınır.
 */
export async function decideDeck(
  id: string,
  input: FlashcardDecisionInput,
  staff: StaffContext,
): Promise<PoolDeck & { panelTransfer: DeckPanelTransfer | null }> {
  const admin = getSupabaseAdminClient();

  if (input.decision === "APPROVED") {
    const { data: current, error: readError } = await admin
      .from("crm_flashcard_decks")
      .select("cards")
      .eq("id", id)
      .eq("status", "PENDING")
      .maybeSingle();
    if (readError) throw dbError(readError);
    if (!current) throw new HttpError(404, "NOT_FOUND");
    const cards = (current as { cards: FlashcardCard[] }).cards;
    if (keptCards(cards, input.excluded_card_ids).length < FLASHCARD_MIN_CARDS) {
      throw new HttpError(409, "TOO_FEW_CARDS");
    }
  }

  const { data, error } = await admin
    .from("crm_flashcard_decks")
    .update({
      status: input.decision,
      excluded_card_ids: input.decision === "APPROVED" ? input.excluded_card_ids : [],
      reviewed_by: staff.userId,
      reviewed_at: new Date().toISOString(),
      review_note: input.review_note,
    })
    .eq("id", id)
    .eq("status", "PENDING")
    .select(DECK_COLUMNS)
    .maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new HttpError(404, "NOT_FOUND");
  const row = data as DeckRow;

  let panelTransfer: DeckPanelTransfer | null = null;
  if (input.decision === "APPROVED") {
    const compensator = createCompensator();
    compensator.push("onay", async () => {
      const { error: undoError } = await admin
        .from("crm_flashcard_decks")
        .update({ status: "PENDING", excluded_card_ids: [], reviewed_by: null, reviewed_at: null, review_note: null })
        .eq("id", id)
        .eq("status", "APPROVED");
      if (undoError) throw undoError;
    });
    try {
      panelTransfer = await transferDeckToPanel(row);
    } catch (transferError) {
      await rollbackOrLog(compensator, id);
      throw transferError;
    }
  }

  await recordAudit(staff, {
    action: "FLASHCARD_DECK_DECIDED",
    entityType: "flashcard_deck",
    entityId: id,
    entityLabel: row.objective_code,
    details: { decision: input.decision, panelTransfer, excluded: row.excluded_card_ids.length },
  });
  return { ...toDto(row), panelTransfer };
}

/** Onayı geri alır: deste kuyruğa döner, kartları panelde pasifleşir (silinmez). Onaylı olmayan deste 404. */
export async function revokeDeckApproval(id: string, staff: StaffContext): Promise<PoolDeck> {
  const admin = getSupabaseAdminClient();
  const { data: before, error: readError } = await admin
    .from("crm_flashcard_decks")
    .select("excluded_card_ids, review_note")
    .eq("id", id)
    .eq("status", "APPROVED")
    .maybeSingle();
  if (readError) throw dbError(readError);
  if (!before) throw new HttpError(404, "NOT_FOUND");
  const previous = before as { excluded_card_ids: string[]; review_note: string | null };

  const { data, error } = await admin
    .from("crm_flashcard_decks")
    .update({ status: "PENDING", excluded_card_ids: [], reviewed_by: null, reviewed_at: null, review_note: null })
    .eq("id", id)
    .eq("status", "APPROVED")
    .select(DECK_COLUMNS)
    .maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new HttpError(404, "NOT_FOUND");
  const row = data as DeckRow;

  const compensator = createCompensator();
  compensator.push("onay geri alma", async () => {
    const { error: undoError } = await admin
      .from("crm_flashcard_decks")
      .update({
        status: "APPROVED",
        excluded_card_ids: previous.excluded_card_ids,
        review_note: previous.review_note,
        reviewed_by: staff.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("status", "PENDING");
    if (undoError) throw undoError;
  });
  try {
    await deactivateEdorasFlashcards(row.cards.map((card) => card.id));
  } catch (panelError) {
    await rollbackOrLog(compensator, id);
    throw panelError;
  }

  await recordAudit(staff, {
    action: "FLASHCARD_DECK_APPROVAL_REVOKED",
    entityType: "flashcard_deck",
    entityId: id,
    entityLabel: row.objective_code,
  });
  return toDto(row);
}
