"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { crmKeys } from "@/features/crm";
import type { ImportItem } from "@/lib/import/bulk";
import type { ProspectConvertInput, ProspectListCreateInput, ProspectPatchInput } from "@/lib/domain/cold-lists/schemas";
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

/** Sıcağa taşı (sunucu, tek işlem): kişi işaretlenir ve CRM adayı oluşur → crmKeys.all (adaylar, görevler, listeler). */
export function useConvertProspect() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: ProspectConvertInput }) => coldListsApi.convert(id, body),
    onSuccess: () => inv.crm(),
  });
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
