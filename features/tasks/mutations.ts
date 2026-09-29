"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { crmKeys } from "@/features/crm";
import { crmNoteKeys } from "@/features/crm-notes";
import type { AssignTaskInput, CompleteTaskInput } from "@/lib/domain/tasks/schemas";
import { tasksApi } from "./api";
import { taskKeys } from "./queries";

/** "Görev ata": POST /api/crm/tasks. Yalnız onaylı diyalogdan (ya da "Arama listesine ekle" onayından) çağrılır. */
export function useAssignTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AssignTaskInput) => tasksApi.assign(body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: taskKeys.all }),
  });
}

/**
 * Tamamla: görev listesi + rozet, aday listesi (statü / arama tarihi değişmiş olabilir) ve adayın notları tazelenir.
 * Hata olursa da liste tazelenir: görev bu arada başkası tarafından kapatılmış ya da koşulu değişmiş olabilir.
 */
export function useCompleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { body: CompleteTaskInput; leadId: string | null }) => tasksApi.complete(vars.body),
    onSuccess: (_r, { leadId }) => {
      void qc.invalidateQueries({ queryKey: crmKeys.all });
      if (leadId) void qc.invalidateQueries({ queryKey: crmNoteKeys.lead(leadId) });
    },
    onError: () => void qc.invalidateQueries({ queryKey: taskKeys.all }),
  });
}

/** Geri al: görev yeniden açılır (not ve aday değişiklikleri kalır). */
export function useReopenTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => tasksApi.reopen(taskId),
    onSettled: () => void qc.invalidateQueries({ queryKey: taskKeys.all }),
  });
}
