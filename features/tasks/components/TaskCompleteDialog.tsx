"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CrmFollowUpFields } from "@/features/crm";
import { useApiErrorMessage } from "@/lib/hooks/use-api-error-message";
import { isIsoDate, todayIso } from "@/lib/domain/institutions/rules";
import { CRM_STATUSES, isLostReason, type CrmStatus } from "@/lib/domain/crm/types";
import { getLeadTitle } from "@/lib/domain/crm/utils";
import { RESULT_NOTE_MAX, type CompleteTaskInput } from "@/lib/domain/tasks/schemas";
import { TASK_OUTCOMES, type TaskOutcome } from "@/lib/domain/tasks/types";
import type { CrmTask } from "@/lib/domain/tasks/view";
import { useCompleteTask } from "../mutations";
import { useTaskKindLabel } from "./labels";

const TEXTAREA_CLASS =
  "flex min-h-[72px] w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 md:text-sm";

/** Gövde: elle atanan görev satır id'siyle, kural görevi anahtar + tür + özne + vade ile (sunucu yeniden türetir). */
function taskRef(task: CrmTask) {
  if (task.kind === "assigned" && task.taskId) return { taskId: task.taskId };
  return {
    derived: { key: task.key ?? task.id, kind: task.kind, leadId: task.leadId, institutionId: task.institutionId, dueDate: task.dueDate },
  };
}

/**
 * Görevi tamamla (DeepSport TaskCompleteDialog): sonuç + not + isteğe bağlı statü ve sonraki arama tarihi.
 * Statü değişiyorsa ayrıca onay istenir. Sunucu hepsini tek transaction'da yazar; sonuç notu adayın notlarına
 * düşer. Adayı olmayan kurum görevinde yalnız sonuç ve not (görevin kaydında kalır).
 */
export function TaskCompleteDialog({
  task,
  open,
  onOpenChange,
}: {
  task: CrmTask | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("crm.tasks.dialog");
  const kindLabel = useTaskKindLabel();
  const tStatus = useTranslations("crm.status");
  const tCommon = useTranslations("common");
  const complete = useCompleteTask();
  const errorMessage = useApiErrorMessage();

  const [outcome, setOutcome] = useState<TaskOutcome>("ulasildi");
  const [status, setStatus] = useState<CrmStatus | "">("");
  const [nextDate, setNextDate] = useState("");
  const [lostReason, setLostReason] = useState("");
  const [text, setText] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [today, setToday] = useState("");

  // Her açılışta formu sıfırla.
  const openKey = open && task ? task.id : null;
  const [prevKey, setPrevKey] = useState<string | null>(null);
  if (openKey !== prevKey) {
    setPrevKey(openKey);
    if (openKey) {
      setOutcome("ulasildi");
      setStatus("");
      setNextDate("");
      setLostReason(task?.lead?.lostReason ?? "");
      setText("");
      setConfirming(false);
      setToday(todayIso());
    }
  }

  if (!task) return null;
  const lead = task.lead;
  const busy = complete.isPending;
  const currentStatus = lead?.status ?? null;
  const name = lead ? getLeadTitle(lead).title : (task.institution?.name ?? "-");
  // Sonraki arama tarihi isteğe bağlı; girildiyse geçerli ve bugün ya da sonrası olmalı.
  const nextDateInvalid = !!nextDate && (!isIsoDate(nextDate) || (!!today && nextDate < today));
  const targetStatus = (status || currentStatus) as CrmStatus | null;

  const submit = async () => {
    if (busy || nextDateInvalid) return;
    const note = [t("noteTitle", { task: kindLabel(task), outcome: t(`outcomes.${outcome}`) }), text.trim()]
      .filter(Boolean)
      .join("\n")
      .slice(0, RESULT_NOTE_MAX);
    const body = {
      ...taskRef(task),
      outcome,
      note,
      ...(lead
        ? {
            status: status || null,
            nextFollowUpAt: nextDate || null,
            lostReason: targetStatus === "OLUMSUZ" && isLostReason(lostReason) ? lostReason : null,
          }
        : {}),
    } as CompleteTaskInput;
    try {
      await complete.mutateAsync({ body, leadId: lead?.id ?? null });
      toast.success(t("success"));
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err, t("error")));
      setConfirming(false);
    }
  };

  const onPrimary = () => {
    if (status && status !== currentStatus && !confirming) setConfirming(true);
    else void submit();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{confirming ? t("confirmTitle") : t("title")}</DialogTitle>
          <DialogDescription>
            {confirming ? (
              t("confirmBody", { name, from: currentStatus ? tStatus(currentStatus) : "-", to: status ? tStatus(status) : "-" })
            ) : (
              <>
                {lead ? t("description") : t("descriptionNoLead")}
                <span className="mt-1 block font-medium text-foreground">
                  {name} · {kindLabel(task)}
                </span>
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {!confirming && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="task-outcome">{t("outcome")}</Label>
                <Select value={outcome} onValueChange={(v) => setOutcome(v as TaskOutcome)} disabled={busy}>
                  <SelectTrigger id="task-outcome">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_OUTCOMES.map((o) => (
                      <SelectItem key={o} value={o}>
                        {t(`outcomes.${o}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {lead && (
                <div className="space-y-1.5">
                  <Label htmlFor="task-status">{t("status")}</Label>
                  <Select value={status || "__keep__"} onValueChange={(v) => setStatus(v === "__keep__" ? "" : (v as CrmStatus))} disabled={busy}>
                    <SelectTrigger id="task-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__keep__">{t("keepStatus", { status: currentStatus ? tStatus(currentStatus) : "-" })}</SelectItem>
                      {CRM_STATUSES.filter((s) => s !== currentStatus).map((s) => (
                        <SelectItem key={s} value={s}>
                          {tStatus(s)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            {lead && (
              <CrmFollowUpFields
                idPrefix="task"
                status={targetStatus ?? "TAKIPTE"}
                nextCall={nextDate}
                onNextCall={setNextDate}
                lostReason={lostReason}
                onLostReason={setLostReason}
                disabled={busy}
              />
            )}
            {nextDateInvalid ? (
              <p className="text-xs text-destructive" role="alert">
                {t("pastDate")}
              </p>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="task-note">{t("note")}</Label>
              <textarea
                id="task-note"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={3}
                maxLength={RESULT_NOTE_MAX - 200}
                disabled={busy}
                className={TEXTAREA_CLASS}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          {confirming ? (
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={busy}>
              {t("back")}
            </Button>
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              {tCommon("cancel")}
            </Button>
          )}
          <Button onClick={onPrimary} disabled={busy || nextDateInvalid} aria-busy={busy}>
            {busy && <Loader2 className="animate-spin" />}
            {confirming ? t("confirm") : t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
