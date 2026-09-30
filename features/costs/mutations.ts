"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CostBudgetInput, CostEntryInput } from "@/lib/domain/costs/schemas";
import { costsApi } from "./api";
import { costKeys } from "./queries";

/** Her yazma maliyet önbelleğinin tamamını yeniler (genel bakış, hizmetler, bütçe durumu, uyarılar, kurum payları birlikte değişir). */
function useInvalidateCosts() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: costKeys.all });
}

export function useCreateCostEntry() {
  const invalidate = useInvalidateCosts();
  return useMutation({ mutationFn: (input: CostEntryInput) => costsApi.createEntry(input), onSuccess: invalidate });
}

export function useUpdateCostEntry() {
  const invalidate = useInvalidateCosts();
  return useMutation({ mutationFn: ({ id, input }: { id: string; input: CostEntryInput }) => costsApi.updateEntry(id, input), onSuccess: invalidate });
}

export function useDeleteCostEntry() {
  const invalidate = useInvalidateCosts();
  return useMutation({ mutationFn: (id: string) => costsApi.deleteEntry(id), onSuccess: invalidate });
}

export function useImportCostEntries() {
  const invalidate = useInvalidateCosts();
  return useMutation({ mutationFn: (rows: CostEntryInput[]) => costsApi.importEntries(rows), onSuccess: invalidate });
}

export function useCreateBudget() {
  const invalidate = useInvalidateCosts();
  return useMutation({ mutationFn: (input: CostBudgetInput) => costsApi.createBudget(input), onSuccess: invalidate });
}

export function useUpdateBudget() {
  const invalidate = useInvalidateCosts();
  return useMutation({ mutationFn: ({ id, input }: { id: string; input: CostBudgetInput }) => costsApi.updateBudget(id, input), onSuccess: invalidate });
}

export function useDeleteBudget() {
  const invalidate = useInvalidateCosts();
  return useMutation({ mutationFn: (id: string) => costsApi.deleteBudget(id), onSuccess: invalidate });
}

export function useUpdateCostSettings() {
  const invalidate = useInvalidateCosts();
  return useMutation({ mutationFn: (input: { smsUnitPriceTry: number }) => costsApi.updateSettings(input), onSuccess: invalidate });
}
