"use client";

/**
 * Toplu işlem çubuğu: tabloda seçilen adaylar için durum (Aranacak / Ulaşılamadı), sorumlu atama ve silme.
 * Durum her CRM kullanıcısına açık; sorumlu atama ve silme yalnız ADMIN (sunucu da 403 döner). Her aday ayrı işlenir;
 * hata verenler atlanır ve toast'ta sayılır. Silme onay penceresinden geçer.
 */
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePermissions } from "@/features/auth";
import { useAssignees } from "@/features/tasks";
import { useApiErrorMessage } from "@/lib/hooks/use-api-error-message";
import { BATCH_STATUSES, type LeadBatchInput } from "@/lib/domain/crm/schemas";
import { useBatchLeads } from "../mutations";

const NO_OWNER = "none";

export function CrmBulkBar({
  ids,
  filteredCount,
  onSelectAllFiltered,
  onClear,
}: {
  /** Süzülmüş listede görünen seçili adaylar. */
  ids: string[];
  /** Süzülmüş listedeki toplam aday (hepsini seçme önerisi için). */
  filteredCount: number;
  onSelectAllFiltered: () => void;
  onClear: () => void;
}) {
  const t = useTranslations("crm.bulk");
  const tStatus = useTranslations("crm.status");
  const errorMessage = useApiErrorMessage();
  const { isAdmin } = usePermissions();
  const { data: members = [] } = useAssignees(isAdmin);
  const batch = useBatchLeads();
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (ids.length === 0) return null;

  const run = async (action: LeadBatchInput["action"], done: string) => {
    try {
      const res = await batch.mutateAsync({ ids, action });
      if (res.failed.length === 0) toast.success(t(done, { count: res.done }));
      else toast.warning(t("partial", { done: res.done, failed: res.failed.length }));
      onClear();
    } catch (err) {
      toast.error(errorMessage(err, t("error")));
    } finally {
      setConfirmDelete(false);
    }
  };

  return (
    <div
      role="region"
      aria-label={t("region")}
      className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2"
    >
      <span className="text-sm font-medium">{t("selected", { count: ids.length })}</span>
      {ids.length < filteredCount && (
        <Button size="sm" variant="ghost" onClick={onSelectAllFiltered} disabled={batch.isPending}>
          {t("selectAll", { count: filteredCount })}
        </Button>
      )}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Select value="" onValueChange={(v) => run({ type: "status", status: v as (typeof BATCH_STATUSES)[number] }, "statusDone")} disabled={batch.isPending}>
          <SelectTrigger className="h-8 w-44" aria-label={t("setStatus")}>
            <SelectValue placeholder={t("setStatus")} />
          </SelectTrigger>
          <SelectContent>
            {BATCH_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {tStatus(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isAdmin && (
          <>
            <Select
              value=""
              onValueChange={(v) => run({ type: "owner", ownerId: v === NO_OWNER ? null : v }, "ownerDone")}
              disabled={batch.isPending}
            >
              <SelectTrigger className="h-8 w-44" aria-label={t("setOwner")}>
                <SelectValue placeholder={t("setOwner")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_OWNER}>{t("ownerNone")}</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="destructive-outline" onClick={() => setConfirmDelete(true)} disabled={batch.isPending}>
              <Trash2 />
              {t("delete")}
            </Button>
          </>
        )}
        <Button size="icon-sm" variant="ghost" onClick={onClear} disabled={batch.isPending} aria-label={t("clear")} title={t("clear")}>
          <X />
        </Button>
      </div>

      <Dialog open={confirmDelete} onOpenChange={(o) => !o && !batch.isPending && setConfirmDelete(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("confirmDelete.title", { count: ids.length })}</DialogTitle>
            <DialogDescription>{t("confirmDelete.body")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)} disabled={batch.isPending}>
              {t("confirmDelete.cancel")}
            </Button>
            <Button variant="destructive" onClick={() => run({ type: "delete" }, "deleteDone")} disabled={batch.isPending} aria-busy={batch.isPending}>
              {batch.isPending && <Loader2 className="animate-spin" />}
              {t("confirmDelete.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
