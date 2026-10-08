"use client";

/**
 * Satır içi statü değişikliği (Adaylar listesi "Satış aşaması" rozeti; aday paneli de kullanır). Yazım yolu düzenleme
 * formuyla aynı uçtur (PATCH /api/crm/leads/{id}); gövde ve kurallar lib/domain/crm/status-change.ts'te. Önbellek
 * iyimser güncellenir (hata olursa geri alınır, bitince sunucudan tazelenir); basit statülerde bildirimde ~5 sn
 * "Geri al" vardır. Aynı anda tek yazım (isSaving).
 */
import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { usePermissions } from "@/features/auth";
import { useApiErrorMessage } from "@/lib/hooks/use-api-error-message";
import { todayIso } from "@/lib/domain/institutions/rules";
import type { LeadPatchInput } from "@/lib/domain/crm/schemas";
import {
  applyFieldsToLead,
  buildStatusChange,
  buildUndoPatch,
  optimisticLeadFields,
  patchLeadInCache,
  statusNeedsContext,
  type StatusChangeError,
  type StatusChangeInput,
} from "@/lib/domain/crm/status-change";
import type { CrmLead, CrmStatus } from "@/lib/domain/crm/types";
import { crmApi } from "./api";
import { crmKeys } from "./queries";

export interface LeadStatusChangeOptions {
  input?: StatusChangeInput;
  /** Satış Oldu'ya geçiş kaydedilince (devir notu penceresi için). */
  onSold?: (lead: CrmLead) => void;
}

export function useLeadStatusUpdate() {
  const t = useTranslations("crm.statusMenu");
  const errMsg = useApiErrorMessage();
  const qc = useQueryClient();
  const { canSeeFinancials } = usePermissions();
  const write = useMutation({ mutationFn: ({ id, data }: { id: string; data: LeadPatchInput }) => crmApi.update(id, data) });

  /** İyimser güncelleme: önbelleği yamalar, geri almak için anlık görüntü döndürür. */
  const applyOptimistic = async (lead: CrmLead, patch: LeadPatchInput) => {
    await qc.cancelQueries({ queryKey: crmKeys.all });
    const snapshot = qc.getQueriesData({ queryKey: crmKeys.all });
    const fields = optimisticLeadFields(lead, patch, todayIso());
    qc.setQueriesData({ queryKey: crmKeys.all }, (data: unknown) =>
      patchLeadInCache(data, lead.id, (l) => ({ ...applyFieldsToLead(l, fields), updatedAt: Date.now() }))
    );
    return snapshot;
  };
  const restore = (snapshot: [QueryKey, unknown][]) => {
    for (const [key, data] of snapshot) qc.setQueryData(key, data);
  };

  const undo = async (prev: CrmLead, forward: LeadPatchInput) => {
    const patch = buildUndoPatch(prev, forward, canSeeFinancials);
    if (!patch) return;
    const snapshot = await applyOptimistic(prev, patch);
    try {
      await crmApi.update(prev.id, patch);
      toast.success(t("undone"));
    } catch (err) {
      restore(snapshot);
      toast.error(errMsg(err, t("undoError")));
    } finally {
      void qc.invalidateQueries({ queryKey: crmKeys.all });
    }
  };

  /**
   * Statüyü yazar. Doğrulama hatasında `{ ok: false, error }` döner (pencere alanın altına yazar); yazım hatasında
   * `{ ok: false }` (bildirim burada gösterilir).
   */
  const change = async (
    lead: CrmLead,
    target: CrmStatus,
    { input, onSold }: LeadStatusChangeOptions = {}
  ): Promise<{ ok: boolean; error?: StatusChangeError }> => {
    if (write.isPending) return { ok: false };
    const built = buildStatusChange({ lead, target, input, canSeeFinancials });
    if (!built.ok) return { ok: false, error: built.error };

    const snapshot = await applyOptimistic(lead, built.patch);
    try {
      await write.mutateAsync({ id: lead.id, data: built.patch });
      if (!statusNeedsContext(target) && lead.status) {
        toast.success(t("updated"), { duration: 5000, action: { label: t("undo"), onClick: () => void undo(lead, built.patch) } });
      } else {
        toast.success(t("updated"));
      }
      if (target === "SATIS_OLDU" && lead.status !== "SATIS_OLDU") {
        onSold?.({ ...lead, ...optimisticLeadFields(lead, built.patch, todayIso()) });
      }
      return { ok: true };
    } catch (err) {
      restore(snapshot);
      toast.error(errMsg(err, t("error")));
      return { ok: false };
    } finally {
      void qc.invalidateQueries({ queryKey: crmKeys.all });
    }
  };

  return { change, canSeeFinancials, isSaving: write.isPending };
}
