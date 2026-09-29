"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useApiErrorMessage } from "@/lib/hooks/use-api-error-message";
import { runSequential } from "@/lib/import/run";
import type { ProspectOutcome } from "@/lib/domain/cold-lists/types";
import { useDeleteProspect, useDeleteProspectList, useInvalidateAfterImport, usePatchProspect } from "../mutations";

export interface DeleteTarget {
  kind: "list" | "prospect";
  id: string;
  name: string;
  /** Liste silmede kişi sayısı. */
  count?: number;
}

/** Liste (yalnız yönetici; sunucu da denetler) ya da tek kişi silme onayı. */
export function DeleteDialog({
  target,
  onClose,
  onListDeleted,
}: {
  target: DeleteTarget | null;
  onClose: () => void;
  onListDeleted: () => void;
}) {
  const t = useTranslations("growth.coldLists");
  const errorText = useApiErrorMessage();
  const deleteList = useDeleteProspectList();
  const deleteProspect = useDeleteProspect();
  const busy = deleteList.isPending || deleteProspect.isPending;

  const confirm = async () => {
    if (!target) return;
    try {
      if (target.kind === "list") {
        await deleteList.mutateAsync(target.id);
        onListDeleted();
      } else {
        await deleteProspect.mutateAsync(target.id);
      }
      toast.success(t("deleted"));
      onClose();
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{target?.kind === "list" ? t("deleteListTitle") : t("deleteProspectTitle")}</DialogTitle>
          <DialogDescription>
            {target?.kind === "list"
              ? t("deleteListBody", { name: target.name, count: target.count ?? 0 })
              : t("deleteProspectBody", { name: target?.name ?? "" })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            {t("cancel")}
          </Button>
          <Button variant="destructive" onClick={() => void confirm()} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Trash2 />}
            {t("confirmDelete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Biriken arama sonuçlarını kaydet (DeepSport sunucu modu): onaydan sonra kişi kişi PATCH (sıralı); sonucun anı
 * sunucuda "şimdi" yazılır. Önbellek sonda bir kez tazelenir.
 */
export function SavePendingDialog({
  open,
  pending,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  pending: Record<string, ProspectOutcome>;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const t = useTranslations("growth.coldLists");
  const patch = usePatchProspect({ quiet: true });
  const invalidate = useInvalidateAfterImport();
  const [saving, setSaving] = useState(false);
  const count = Object.keys(pending).length;

  const save = async () => {
    setSaving(true);
    const r = await runSequential(Object.entries(pending), ([id, outcome]) => patch.mutateAsync({ id, patch: { outcome } }));
    await invalidate("coldList");
    setSaving(false);
    onOpenChange(false);
    onSaved();
    if (r.failed.length) toast.error(t("savePartial", { ok: r.ok, failed: r.failed.length + r.remaining }));
    else toast.success(t("saved", { count: r.ok }));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("saveTitle")}</DialogTitle>
          <DialogDescription>{t("saveBody", { count })}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("cancel")}
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving && <Loader2 className="animate-spin" />}
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
