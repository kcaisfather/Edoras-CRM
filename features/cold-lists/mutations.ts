"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { crmKeys } from "@/features/crm";
import { crmNoteKeys } from "@/features/crm-notes";
import { apiErrorCode } from "@/lib/api/errors";
import type { ImportItem } from "@/lib/import/bulk";
import { chunk } from "@/lib/import/run";
import {
  LEADS_TO_COLD_LIST_CHUNK,
  emptyLeadsToColdListResult,
  mergeLeadsToColdListResults,
  type LeadsToColdListResult,
} from "@/lib/domain/cold-lists/bulk-return";
import type {
  LeadToColdListInput,
  LeadsToColdListInput,
  ProspectConvertInput,
  ProspectCreateInput,
  ProspectListCreateInput,
  ProspectPatchInput,
} from "@/lib/domain/cold-lists/schemas";
import { coldListsApi } from "./api";
import { TASKS_ROOT_KEY, coldListKeys } from "./queries";

/**
 * Soğuk liste yazımları. Her mutasyon soğuk liste önbelleğini tazeler; kişinin sonucunu ya da listeyi değiştirenler
 * Görevlerim'i de (soğuk liste görevleri kişilerden türetilir). "Sıcağa taşı" ve aday içe aktarma CRM adaylarını da.
 */
function useInvalidate() {
  const qc = useQueryClient();
  return {
    coldLists: () => qc.invalidateQueries({ queryKey: coldListKeys.all }),
    tasks: () => qc.invalidateQueries({ queryKey: TASKS_ROOT_KEY }),
    crm: () => qc.invalidateQueries({ queryKey: crmKeys.all }),
  };
}

export function useCreateProspectList() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (body: ProspectListCreateInput) => coldListsApi.createList(body),
    onSuccess: () => inv.coldLists(),
  });
}

/** Toplu ekleme parçası; önbellek iş bitince bir kez tazelenir (useInvalidateAfterImport). */
export function useBulkAddProspects() {
  return useMutation({
    mutationFn: ({ listId, items }: { listId: string; items: ImportItem[] }) => coldListsApi.bulkAdd(listId, items),
  });
}

/** "Kişi ekle": listeye tek kişi (elle). Yeni kişi "Aranmadı" — Görevlerim de tazelenir. */
export function useCreateProspect() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: ({ listId, body }: { listId: string; body: ProspectCreateInput }) => coldListsApi.createProspect(listId, body),
    onSuccess: () => Promise.all([inv.coldLists(), inv.tasks()]),
  });
}

/** Arama sonucu / alan güncellemesi. `quiet`: toplu kayıtta önbellek her adımda değil, sonda tazelenir. */
export function usePatchProspect({ quiet = false }: { quiet?: boolean } = {}) {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ProspectPatchInput }) => coldListsApi.patch(id, patch),
    onSuccess: () => (quiet ? undefined : Promise.all([inv.coldLists(), inv.tasks()])),
  });
}

export function useDeleteProspectList() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => coldListsApi.deleteList(id),
    onSuccess: () => Promise.all([inv.coldLists(), inv.tasks()]),
  });
}

export function useDeleteProspect() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => coldListsApi.remove(id),
    onSuccess: () => Promise.all([inv.coldLists(), inv.tasks()]),
  });
}

/**
 * Sıcağa taşı (sunucu, tek işlem): kişi işaretlenir ve CRM adayı oluşur → crmKeys.all (adaylar, görevler, listeler).
 * Tazeleme beklenir: pencere ardından Adaylar'a (/crm?lead=<id>) gider, yeni aday önbellekte hazır olsun.
 */
export function useConvertProspect() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: ProspectConvertInput }) => coldListsApi.convert(id, body),
    onSuccess: () => inv.crm(),
  });
}

/**
 * "Soğuk listeye geri gönder" (Sıcağa taşı'nın tersi; sunucu): aday "Satış olmadı" olur, kişi listeye döner →
 * crmKeys.all (adaylar, görevler ve soğuk listeler onun altında) + adayın notları (sunucu bir not ekler).
 */
export function useReturnLeadToColdList() {
  const inv = useInvalidate();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ leadId, body }: { leadId: string; body: LeadToColdListInput }) => coldListsApi.returnLead(leadId, body),
    onSuccess: (_data, { leadId }) => Promise.all([inv.crm(), qc.invalidateQueries({ queryKey: crmNoteKeys.lead(leadId) })]),
  });
}

/**
 * Toplu "Soğuk listeye taşı" (Adaylar toplu işlem çubuğu): seçim LEADS_TO_COLD_LIST_CHUNK'lık parçalarla SIRAYLA
 * gönderilir (her istek kısa sürer), ilerleme `progress`'te. Parça içinde hata veren aday atlanır (sunucu sayar). Bir
 * parça bütünüyle reddedilirse (liste silindi, oturum düştü…) kalanlar gönderilmez ve o kodla atlanmış sayılır; ilk
 * parça reddedilirse hata fırlatılır (hiçbir şey yazılmamıştır). Bitince adaylar, görevler, soğuk listeler ve notlar
 * tazelenir.
 */
export function useReturnLeadsToColdList() {
  const inv = useInvalidate();
  const qc = useQueryClient();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const mutation = useMutation({
    mutationFn: async ({ leadIds, listId, lostReason }: LeadsToColdListInput): Promise<LeadsToColdListResult> => {
      const ids = [...new Set(leadIds)];
      let result = emptyLeadsToColdListResult();
      let sent = 0;
      setProgress({ done: 0, total: ids.length });
      for (const part of chunk(ids, LEADS_TO_COLD_LIST_CHUNK)) {
        try {
          result = mergeLeadsToColdListResults(result, await coldListsApi.returnLeads({ leadIds: part, listId, lostReason }));
        } catch (err) {
          if (sent === 0) throw err;
          const code = apiErrorCode(err) ?? "INTERNAL";
          return { ...result, skipped: [...result.skipped, ...ids.slice(sent).map((id) => ({ id, code }))] };
        }
        sent += part.length;
        setProgress({ done: sent, total: ids.length });
      }
      return result;
    },
    onSettled: async () => {
      setProgress(null);
      await Promise.all([inv.crm(), qc.invalidateQueries({ queryKey: crmNoteKeys.all })]);
    },
  });
  return { ...mutation, progress };
}

/** Aday içe aktarma parçası (dryRun dahil); önbellek iş bitince bir kez tazelenir (useInvalidateAfterImport). */
export function useImportLeadsChunk() {
  return useMutation({
    mutationFn: ({ items, dryRun }: { items: ImportItem[]; dryRun: boolean }) => coldListsApi.importLeads(items, dryRun),
  });
}

/** İçe aktarma ya da toplu kayıt bittiğinde: soğuk listeler ya da adaylar (+ görevler) bir kez tazelenir. */
export function useInvalidateAfterImport() {
  const inv = useInvalidate();
  return (target: "coldList" | "crm") => (target === "crm" ? inv.crm() : Promise.all([inv.coldLists(), inv.tasks()]));
}
