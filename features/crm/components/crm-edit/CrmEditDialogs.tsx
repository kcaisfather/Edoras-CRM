"use client";

import { useTranslations } from "next-intl";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** "Adayı sil" onayı (eski düzenleme penceresiyle aynı metinler). */
export function CrmDeleteConfirmDialog({
  open,
  onOpenChange,
  busy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  onConfirm: () => void;
}) {
  const t = useTranslations("crm.edit");
  const tCommon = useTranslations("common");
  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("deleteConfirmTitle")}</DialogTitle>
          <DialogDescription>{t("deleteConfirmDescription")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {tCommon("cancel")}
          </Button>
          <Button variant="destructive" disabled={busy} aria-busy={busy} onClick={onConfirm}>
            {busy ? <Loader2 className="animate-spin" /> : <Trash2 />}
            {busy ? t("deleting") : t("deleteConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Kaydedilmemiş değişiklikle paneli kapatmaya çalışınca sorulur. */
export function CrmUnsavedDialog({
  open,
  onOpenChange,
  onDiscard,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDiscard: () => void;
}) {
  const t = useTranslations("crm.detail");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("unsavedTitle")}</DialogTitle>
          <DialogDescription>{t("unsavedBody")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("unsavedKeep")}
          </Button>
          <Button variant="destructive" onClick={onDiscard}>
            {t("unsavedDiscard")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
