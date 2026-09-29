"use client";

/**
 * İçe aktarma akışının durumu ve yazımı (DeepSport components/import/ImportDialog → ImportFlow'un mantığı):
 * dosya → sütun eşleme → önizleme ve mükerrer çözümü → onay → kaydet → özet.
 *
 * Farklar (EdorasCRM): kayıtlar satır satır değil 500'erli toplu isteklerle gider (durdurulabilir, parça parça
 * ilerleme); sunucu telefon / e-postayı yeniden normalleştirir ve mükerrerleri kendisi ayıklar — atladığı satırlar
 * özette nedeniyle görünür. CRM hedefinde onaydan önce sunucu ön kontrolü (dryRun) yapılır. Soğuk liste hedefinde
 * önizleme yalnız seçilen listeyle karşılaştırır (sunucu da yalnız aynı listede mükerrer sayar).
 */
import { useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useAllCrmLeads } from "@/features/crm";
import { useApiErrorMessage } from "@/lib/hooks/use-api-error-message";
import { ImportFileError, readImportFile, type RawTable } from "@/lib/import/parse";
import { guessMapping, type ColumnMapping } from "@/lib/import/fields";
import { buildRecords, hasInvalidEmail, hasInvalidPhone, recordDisplayName, type ImportRecord } from "@/lib/import/records";
import { findDuplicateGroups, planImport, type ExistingContact, type ImportPlan, type Resolution } from "@/lib/import/duplicates";
import { crmLeadToExisting, institutionToExisting } from "@/lib/import/existing";
import { BULK_CHUNK_SIZE, recordToImportItem, type BulkImportResult, type ImportTarget, type SkippedRow } from "@/lib/import/bulk";
import { chunk, runSequential } from "@/lib/import/run";
import { fillEmptyFields, prospectToExisting } from "@/lib/domain/cold-lists/utils";
import {
  useBulkAddProspects,
  useCreateProspectList,
  useImportLeadsChunk,
  useInvalidateAfterImport,
  usePatchProspect,
} from "../../mutations";
import { useListProspects, useProspectLists } from "../../queries";

export type { ImportTarget };
export type ImportStep = "file" | "map" | "review" | "confirm" | "running" | "done";
export const NEW_LIST = "__new__";

export interface ImportFailure {
  label: string;
  error: string;
}

export interface ImportSummary {
  target: ImportTarget;
  created: number;
  merged: number;
  /** İstemci planının atladığı (mükerrer çözümü) satırlar. */
  skipped: number;
  /** Sunucunun eklemediği satırlar ve nedenleri. */
  serverSkipped: SkippedRow[];
  failed: ImportFailure[];
  stopped: boolean;
  notSent: number;
  listId?: string;
}

export interface ServerCheck {
  state: "idle" | "loading" | "done" | "error";
  created: number;
  skipped: number;
  error?: string;
}

export interface ImportFlowOptions {
  targets: readonly ImportTarget[];
  defaultTarget?: ImportTarget;
  defaultListId?: string | null;
  onCompleted?: (summary: ImportSummary) => void;
  onBusyChange: (busy: boolean) => void;
}

/** Mevcut kayıtlar (önizleme): CRM adayları, kurum yetkilileri ve (soğuk liste hedefinde) seçilen listenin kişileri. */
function useExistingContacts(target: ImportTarget, listChoice: string) {
  const crm = useAllCrmLeads(true);
  const lists = useProspectLists();
  const listId = target === "coldList" && listChoice !== NEW_LIST ? listChoice : null;
  const listProspects = useListProspects(listId);
  const listNames = useMemo(() => new Map((lists.data ?? []).map((l) => [l.id, l.name])), [lists.data]);
  const existing = useMemo((): ExistingContact[] => {
    const out: ExistingContact[] = crm.leads.map(crmLeadToExisting);
    for (const i of crm.institutions ?? []) {
      const e = institutionToExisting(i);
      if (e) out.push(e);
    }
    if (listId) out.push(...(listProspects.data?.items ?? []).map((p) => prospectToExisting(p, listNames.get(listId))));
    return out;
  }, [crm.leads, crm.institutions, listId, listProspects.data, listNames]);
  return {
    existing,
    lists: lists.data ?? [],
    listNames,
    prospects: listProspects.data?.items ?? [],
    loading: crm.isLoading || crm.institutionsLoading || lists.isLoading || (!!listId && listProspects.isLoading),
    crmError: crm.isError,
    institutionsError: crm.institutionsError,
    listError: !!listId && listProspects.isError,
  };
}

const rowsLabel = (recs: readonly ImportRecord[]) => ({
  from: Math.min(...recs.map((r) => r.rowNumber)),
  to: Math.max(...recs.map((r) => r.rowNumber)),
  count: recs.length,
});

export function useImportFlow({ targets, defaultTarget, defaultListId, onCompleted, onBusyChange }: ImportFlowOptions) {
  const t = useTranslations("growth.import");
  const errorText = useApiErrorMessage();

  const [step, setStep] = useState<ImportStep>("file");
  const [target, setTarget] = useState<ImportTarget>(defaultTarget && targets.includes(defaultTarget) ? defaultTarget : targets[0]);
  const [fileName, setFileName] = useState("");
  const [table, setTable] = useState<RawTable | null>(null);
  const [reading, setReading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [resolutions, setResolutions] = useState<Record<string, Resolution>>({});
  const [fallback, setFallback] = useState<Resolution>("skip");
  const [listChoice, setListChoice] = useState<string>(defaultListId || NEW_LIST);
  const [newListName, setNewListName] = useState("");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [stopping, setStopping] = useState(false);
  const stopRef = useRef(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [serverCheck, setServerCheck] = useState<ServerCheck>({ state: "idle", created: 0, skipped: 0 });

  const ctx = useExistingContacts(target, listChoice);
  const createList = useCreateProspectList();
  const bulkAdd = useBulkAddProspects();
  const patchProspect = usePatchProspect({ quiet: true });
  const importLeads = useImportLeadsChunk();
  const invalidateAfterImport = useInvalidateAfterImport();

  const built = useMemo(() => (table ? buildRecords(table, mapping) : null), [table, mapping]);
  const records = useMemo(() => built?.records ?? [], [built]);
  const groups = useMemo(
    () => (step === "file" || step === "map" ? [] : findDuplicateGroups(records, ctx.existing)),
    [records, ctx.existing, step]
  );
  const plan: ImportPlan = useMemo(() => planImport(records, groups, resolutions, fallback), [records, groups, resolutions, fallback]);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setReading(true);
    setFileError(null);
    try {
      const tbl = await readImportFile(file);
      setTable(tbl);
      setFileName(file.name);
      setMapping(guessMapping(tbl.headers));
      setResolutions({});
      setNewListName(file.name.replace(/\.[^.]+$/, "").slice(0, 120));
      setStep("map");
    } catch (e) {
      setFileError(e instanceof ImportFileError ? t(`errors.${e.code}`) : t("errors.read"));
    } finally {
      setReading(false);
    }
  };

  const setAll = (r: Resolution) => {
    setFallback(r);
    setResolutions(Object.fromEntries(groups.map((g) => [g.key, r])));
  };

  /** CRM hedefi: yazmadan önce sunucunun raporu (dryRun, parça parça). */
  const checkServer = async () => {
    setServerCheck({ state: "loading", created: 0, skipped: 0 });
    try {
      let created = 0;
      let skipped = 0;
      for (const part of chunk(plan.creates, BULK_CHUNK_SIZE)) {
        const res = await importLeads.mutateAsync({ items: part.map(recordToImportItem), dryRun: true });
        created += res.created;
        skipped += res.skipped.length;
      }
      setServerCheck({ state: "done", created, skipped });
    } catch (e) {
      setServerCheck({ state: "error", created: 0, skipped: 0, error: errorText(e) });
    }
  };

  const goConfirm = () => {
    setStep("confirm");
    if (target === "crm" && plan.creates.length > 0) void checkServer();
  };

  const finish = (s: ImportSummary) => {
    setSummary(s);
    setStep("done");
    onBusyChange(false);
    void invalidateAfterImport(s.target);
    onCompleted?.(s);
  };

  /** Oluşturma parçaları (toplu istek) — sunucunun eklediği ve atladığı satırlar toplanır. */
  const sendChunks = async (send: (items: ReturnType<typeof recordToImportItem>[]) => Promise<BulkImportResult>, offset: number, total: number) => {
    const parts = chunk(plan.creates, BULK_CHUNK_SIZE);
    let created = 0;
    const serverSkipped: SkippedRow[] = [];
    const result = await runSequential(
      parts,
      async (part) => {
        const res = await send(part.map(recordToImportItem));
        created += res.created;
        serverSkipped.push(...res.skipped);
      },
      {
        onProgress: (done) => setProgress({ done: offset + Math.min(plan.creates.length, done * BULK_CHUNK_SIZE), total }),
        shouldStop: () => stopRef.current,
        maxConsecutiveFailures: 2,
      }
    );
    const failed = result.failed.map((f) => ({ label: t("failedChunk", rowsLabel(f.item)), error: errorText(f.error) }));
    const notSent = parts.slice(parts.length - result.remaining).reduce((n, p) => n + p.length, 0);
    return { created, serverSkipped, failed, stopped: result.stopped, notSent };
  };

  const runColdList = async (total: number) => {
    let listId = listChoice;
    try {
      if (listChoice === NEW_LIST || !ctx.lists.some((l) => l.id === listChoice)) {
        const list = await createList.mutateAsync({ name: newListName.trim() || fileName || t("defaultListName"), sourceFile: fileName || null });
        listId = list.id;
      }
    } catch (e) {
      finish({ target: "coldList", created: 0, merged: 0, skipped: plan.stats.skipped, serverSkipped: [], failed: [{ label: t("newListName"), error: errorText(e) }], stopped: false, notSent: plan.creates.length });
      return;
    }
    const sent = await sendChunks((items) => bulkAdd.mutateAsync({ listId, items }), 0, total);
    // Birleştir: listedeki mevcut kişinin boş alanları (CRM adayı ve kurum kaydına dokunulmaz).
    const byId = new Map(ctx.prospects.map((p) => [p.id, p]));
    const merges = plan.mergeIntoExisting.filter((m) => m.existing.source === "coldList" && byId.has(m.existing.id));
    const merged = await runSequential(
      sent.stopped ? [] : merges,
      async ({ record, existing }) => {
        const current = byId.get(existing.id);
        const patch = current ? fillEmptyFields(current, record) : {};
        if (Object.keys(patch).length > 0) await patchProspect.mutateAsync({ id: existing.id, patch });
      },
      { onProgress: (d) => setProgress({ done: plan.creates.length + d, total }), shouldStop: () => stopRef.current }
    );
    finish({
      target: "coldList",
      created: sent.created,
      merged: plan.stats.merged,
      skipped: plan.stats.skipped,
      serverSkipped: sent.serverSkipped,
      failed: [
        ...sent.failed,
        ...merged.failed.map((f) => ({ label: t("failedRow", { row: f.item.record.rowNumber, name: recordDisplayName(f.item.record) }), error: errorText(f.error) })),
      ],
      stopped: sent.stopped || merged.stopped,
      notSent: sent.notSent + merged.remaining + (sent.stopped ? merges.length : 0),
      listId,
    });
  };

  const runCrm = async (total: number) => {
    const sent = await sendChunks((items) => importLeads.mutateAsync({ items, dryRun: false }), 0, total);
    finish({ target: "crm", merged: plan.stats.merged, skipped: plan.stats.skipped, ...sent });
  };

  const start = () => {
    stopRef.current = false;
    setStopping(false);
    setStep("running");
    onBusyChange(true);
    const total = plan.creates.length + (target === "coldList" ? plan.mergeIntoExisting.filter((m) => m.existing.source === "coldList").length : 0);
    setProgress({ done: 0, total });
    void (target === "crm" ? runCrm(total) : runColdList(total));
  };

  const stop = () => {
    stopRef.current = true;
    setStopping(true);
  };

  return {
    step,
    setStep,
    target,
    setTarget,
    fileName,
    table,
    reading,
    fileError,
    handleFile,
    mapping,
    setMapping,
    built,
    records,
    invalidPhones: records.filter(hasInvalidPhone).length,
    invalidEmails: records.filter(hasInvalidEmail).length,
    groups,
    plan,
    resolutions,
    setResolutions,
    fallback,
    setAll,
    listChoice,
    setListChoice,
    newListName,
    setNewListName,
    ctx,
    goConfirm,
    serverCheck,
    start,
    stop,
    stopping,
    progress,
    summary,
  };
}

export type ImportFlow = ReturnType<typeof useImportFlow>;
