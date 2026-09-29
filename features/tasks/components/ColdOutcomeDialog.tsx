"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Link } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePatchProspect } from "@/features/cold-lists";
import { useApiErrorMessage } from "@/lib/hooks/use-api-error-message";
import type { ProspectOutcome } from "@/lib/domain/cold-lists/types";
import { prospectTitle } from "@/lib/domain/cold-lists/utils";
import type { CrmTask } from "@/lib/domain/tasks/view";

/** Görevden girilebilen sonuçlar ("Aranmadı" hariç). */
const OUTCOMES: ProspectOutcome[] = ["TALKED", "UNREACHABLE", "NOT_INTERESTED"];

export const coldListHref = (listId: string | null | undefined) =>
  listId ? `/crm/cold-lists?list=${encodeURIComponent(listId)}` : "/crm/cold-lists";

/**
 * Soğuk liste görevi (kural "coldList", DeepSport ColdOutcomeDialog): görevi kapatmak = kişinin arama sonucunu girmek
 * (PATCH /api/crm/prospects/{id}; sonucun anı sunucuda yazılır). crm_tasks'a satır yazılmaz: Görüşüldü / İlgilenmiyor
 * → görev düşer; Ulaşılamadı → kuraldaki gün sonra yeniden görev olur. CRM'e alma soğuk liste ekranında ("Sıcağa taşı").
 */
export function ColdOutcomeDialog({
  task,
  retryDays,
  open,
  onOpenChange,
}: {
  task: CrmTask | null;
  retryDays: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("crm.tasks.cold");
  const tOutcome = useTranslations("growth.coldLists.outcomes");
  const tCommon = useTranslations("common");
  const errorMessage = useApiErrorMessage();
  const patch = usePatchProspect();
  const [outcome, setOutcome] = useState<ProspectOutcome>("TALKED");

  // Her açılışta formu sıfırla.
  const openKey = open && task ? task.id : null;
  const [prevKey, setPrevKey] = useState<string | null>(null);
  if (openKey !== prevKey) {
    setPrevKey(openKey);
    if (openKey) setOutcome("TALKED");
  }

  const prospect = task?.prospect;
  if (!task || !prospect) return null;
  const busy = patch.isPending;

  const submit = async () => {
    if (busy) return;
    try {
      await patch.mutateAsync({ id: prospect.id, patch: { outcome } });
      toast.success(t("success"));
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err, t("error")));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {t("description")}
            <span className="mt-1 block font-medium text-foreground">
              {prospectTitle({ ...prospect, emailRaw: prospect.email ?? "" })}
            </span>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="cold-outcome">{t("outcome")}</Label>
          <Select value={outcome} onValueChange={(v) => setOutcome(v as ProspectOutcome)} disabled={busy}>
            <SelectTrigger id="cold-outcome">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OUTCOMES.map((o) => (
                <SelectItem key={o} value={o}>
                  {tOutcome(o)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {outcome === "UNREACHABLE" ? t("hint.UNREACHABLE", { days: retryDays }) : t(`hint.${outcome}`)}
          </p>
          {outcome === "TALKED" && (
            <Link href={coldListHref(prospect.listId)} className="inline-block text-xs text-primary underline-offset-2 hover:underline">
              {t("openList")}
            </Link>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {tCommon("cancel")}
          </Button>
          <Button onClick={() => void submit()} disabled={busy} aria-busy={busy}>
            {busy && <Loader2 className="animate-spin" />}
            {t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
