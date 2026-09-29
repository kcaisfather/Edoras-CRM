"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/features/auth";
import { useApiErrorMessage } from "@/lib/hooks/use-api-error-message";
import { addDays, isIsoDate, todayIso } from "@/lib/domain/institutions/rules";
import { getLeadTitle } from "@/lib/domain/crm/utils";
import type { CrmLead } from "@/lib/domain/crm/types";
import { ASSIGN_NOTE_MAX } from "@/lib/domain/tasks/schemas";
import { ASSIGNMENT_TYPES, type AssignmentType } from "@/lib/domain/tasks/types";
import { useAssignTask } from "../mutations";
import { useAssignees } from "../queries";

const TEXTAREA_CLASS =
  "flex min-h-[72px] w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 md:text-sm";

const QUICK_DATES = [
  { key: "today", days: 0 },
  { key: "tomorrow", days: 1 },
  { key: "plus3", days: 3 },
  { key: "plus7", days: 7 },
] as const;

const UNASSIGNED = "__none__";

export interface AssignTaskDialogProps {
  lead: CrmLead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Açılışta seçili amaç (varsayılan "arama"). */
  defaultType?: AssignmentType;
}

/**
 * "Görev ata" (DeepSport AssignTaskDialog) — bir adaya amaç + tarih (+ not, + atanan kişi) ile görev atar. Kayıt
 * yalnız "Görevi ata" düğmesiyle yapılır; görev crm_tasks'a yazılır ve Görevlerim'de görünür. Atanan kişi:
 * yönetici aktif ekipten birini seçer; satış temsilcisi yalnız kendini ya da ekip havuzunu (sunucu da denetler).
 */
export function AssignTaskDialog({ lead, open, onOpenChange, defaultType = "arama" }: AssignTaskDialogProps) {
  const t = useTranslations("crm.tasks.assign");
  const tCommon = useTranslations("common");
  const assign = useAssignTask();
  const errorMessage = useApiErrorMessage();

  const [type, setType] = useState<AssignmentType>(defaultType);
  const [today, setToday] = useState("");
  const [due, setDue] = useState("");
  const [note, setNote] = useState("");
  const [assigneeId, setAssigneeId] = useState<string>(UNASSIGNED);

  // Her açılışta formu sıfırla (tarih: bugün).
  const openKey = open && lead ? lead.id : null;
  const [prevKey, setPrevKey] = useState<string | null>(null);
  if (openKey !== prevKey) {
    setPrevKey(openKey);
    if (openKey) {
      const now = todayIso();
      setType(defaultType);
      setToday(now);
      setDue(now);
      setNote("");
      setAssigneeId(UNASSIGNED);
    }
  }

  if (!lead) return null;
  const dateInvalid = !isIsoDate(due) || (!!today && due < today);
  const busy = assign.isPending;

  const submit = async () => {
    if (busy || dateInvalid) return;
    try {
      await assign.mutateAsync({
        leadId: lead.id,
        dueDate: due,
        type,
        note: note.trim().slice(0, ASSIGN_NOTE_MAX) || undefined,
        assigneeId: assigneeId === UNASSIGNED ? null : assigneeId,
      });
      toast.success(t("success"));
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err, t("error")));
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {t("description")}
            <span className="mt-1 block font-medium text-foreground">{getLeadTitle(lead).title}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="assign-type">{t("type")}</Label>
            <Select value={type} onValueChange={(v) => setType(v as AssignmentType)} disabled={busy}>
              <SelectTrigger id="assign-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASSIGNMENT_TYPES.map((k) => (
                  <SelectItem key={k} value={k}>
                    {t(`types.${k}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="assign-date">{t("date")}</Label>
            <Input
              id="assign-date"
              type="date"
              value={due}
              min={today || undefined}
              onChange={(e) => setDue(e.target.value)}
              disabled={busy}
              aria-invalid={dateInvalid || undefined}
              aria-describedby={dateInvalid ? "assign-date-error" : undefined}
            />
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("quickLabel")}>
              {QUICK_DATES.map(({ key, days }) => {
                const value = today ? addDays(today, days) : "";
                const active = !!value && value === due;
                return (
                  <Button
                    key={key}
                    type="button"
                    size="sm"
                    variant={active ? "secondary" : "outline"}
                    className={cn("h-7 px-2.5 text-xs", active && "ring-1 ring-primary/40")}
                    aria-pressed={active}
                    disabled={busy}
                    onClick={() => setDue(addDays(todayIso(), days))}
                  >
                    {t(`quick.${key}`)}
                  </Button>
                );
              })}
            </div>
            {dateInvalid && (
              <p id="assign-date-error" className="text-xs text-destructive">
                {t("pastDate")}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="assign-note">{t("note")}</Label>
            <textarea
              id="assign-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("notePlaceholder")}
              maxLength={ASSIGN_NOTE_MAX}
              rows={3}
              disabled={busy}
              className={TEXTAREA_CLASS}
            />
          </div>

          {open && <AssigneeField value={assigneeId} onChange={setAssigneeId} disabled={busy} />}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {tCommon("cancel")}
          </Button>
          <Button onClick={() => void submit()} disabled={busy || dateInvalid} aria-busy={busy}>
            {busy && <Loader2 className="animate-spin" />}
            {t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** "Atanan kişi" — seçenekler sunucudan (yönetici: aktif ekip; temsilci: yalnız kendisi). Liste alınamazsa gizlenir. */
function AssigneeField({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled: boolean }) {
  const t = useTranslations("crm.tasks.assign");
  const { isAdmin } = usePermissions();
  const { data: members = [] } = useAssignees();
  if (members.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <Label htmlFor="assign-assignee">{t("assignee")}</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id="assign-assignee">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={UNASSIGNED}>{t("unassigned")}</SelectItem>
          {members.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">{isAdmin ? t("assigneeHint") : t("agentHint")}</p>
    </div>
  );
}
