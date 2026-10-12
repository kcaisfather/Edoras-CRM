"use client";

import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useApiErrorMessage } from "@/lib/hooks/use-api-error-message";
import { formatCrmDate, getLeadTitle } from "@/lib/domain/crm/utils";
import type { CrmTask } from "@/lib/domain/tasks/view";
import { useRemoveTask } from "../mutations";
import { useTaskKindLabel } from "./labels";

/**
 * "Kaldır" onayı (2026-10-12): elle eklenen açık görevi Görevlerim'den siler (DELETE /api/crm/tasks/{id}). Geri alınamaz;
 * işlem kaydına yazılır. Yetki sunucuda (ekleyen, atanan kişi ya da yönetici); hata olursa liste tazelenir ve pencere
 * kapanır.
 */
export function TaskRemoveDialog({ task, onOpenChange }: { task: CrmTask | null; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations("crm.tasks.remove");
  const tCommon = useTranslations("common");
  const remove = useRemoveTask();
  const errorMessage = useApiErrorMessage();
  const kindLabel = useTaskKindLabel();
  const busy = remove.isPending;

  const name = task ? (task.lead ? getLeadTitle(task.lead).title : (task.institution?.name ?? "—")) : "";

  const confirm = () => {
    if (!task?.taskId || busy) return;
    remove.mutate(task.taskId, {
      onSuccess: () => {
        toast.success(t("success"));
        onOpenChange(false);
      },
      onError: (err) => {
        toast.error(errorMessage(err, t("error")));
        onOpenChange(false);
      },
    });
  };

  return (
    <Dialog open={!!task} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {task ? t("body", { name, task: kindLabel(task), date: formatCrmDate(task.dueDate) }) : null}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {tCommon("cancel")}
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={busy || !task?.taskId} aria-busy={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Trash2 />}
            {busy ? t("removing") : t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
