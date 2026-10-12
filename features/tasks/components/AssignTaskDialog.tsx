"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { SidePanel, SidePanelContent, SidePanelDescription, SidePanelFooter, SidePanelHeader, SidePanelTitle } from "@/components/ui/side-panel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/features/auth";
import { useAllCrmLeads } from "@/features/crm";
import { formatPhone } from "@/features/institutions";
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
/** Aday seçtirilen açılışın (Görevlerim → "Görev ekle") sıfırlama anahtarı. */
const PICK_KEY = "__pick__";

export interface AssignTaskDialogProps {
  lead: CrmLead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Açılışta seçili amaç (varsayılan "arama"). */
  defaultType?: AssignmentType;
  /**
   * Görevlerim → "Görev ekle" (2026-10-12): aday önceden seçili değil (`lead` null); formda aranabilir aday alanı çizilir.
   * Görev her zaman bir adaya bağlıdır (crm_tasks_subject_check) — aday seçilmeden kaydedilmez.
   */
  pickLead?: boolean;
}

/**
 * "Görev ata" (DeepSport AssignTaskDialog) — bir adaya amaç + tarih (+ not, + atanan kişi) ile görev atar. Kayıt
 * yalnız "Görevi ata" düğmesiyle yapılır; görev crm_tasks'a yazılır ve Görevlerim'de görünür. Atanan kişi:
 * yönetici aktif ekipten birini seçer; satış temsilcisi yalnız kendini ya da ekip havuzunu (sunucu da denetler).
 * `pickLead`: aynı form Görevlerim'deki "Görev ekle"de aday seçtirerek açılır (aynı uç: POST /api/crm/tasks).
 */
export function AssignTaskDialog({ lead, open, onOpenChange, defaultType = "arama", pickLead = false }: AssignTaskDialogProps) {
  const t = useTranslations("crm.tasks.assign");
  const tCommon = useTranslations("common");
  const assign = useAssignTask();
  const errorMessage = useApiErrorMessage();

  const [type, setType] = useState<AssignmentType>(defaultType);
  const [today, setToday] = useState("");
  const [due, setDue] = useState("");
  const [note, setNote] = useState("");
  const [assigneeId, setAssigneeId] = useState<string>(UNASSIGNED);
  const [pickedLeadId, setPickedLeadId] = useState("");

  // Her açılışta formu sıfırla (tarih: bugün).
  const openKey = open ? (lead?.id ?? (pickLead ? PICK_KEY : null)) : null;
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
      setPickedLeadId("");
    }
  }

  const picking = !lead && pickLead;
  if (!lead && !picking) return null;
  const leadId = lead?.id ?? pickedLeadId;
  const dateInvalid = !isIsoDate(due) || (!!today && due < today);
  const busy = assign.isPending;
  const t2 = (key: "title" | "description" | "submit" | "success") => t(picking ? `add.${key}` : key);

  const submit = async () => {
    if (busy || dateInvalid || !leadId) return;
    try {
      await assign.mutateAsync({
        leadId,
        dueDate: due,
        type,
        note: note.trim().slice(0, ASSIGN_NOTE_MAX) || undefined,
        assigneeId: assigneeId === UNASSIGNED ? null : assigneeId,
      });
      toast.success(t2("success"));
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err, t("error")));
    }
  };

  return (
    <SidePanel
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
    >
      <SidePanelContent size="md">
        <SidePanelHeader>
          <SidePanelTitle>{t2("title")}</SidePanelTitle>
          <SidePanelDescription>
            {t2("description")}
            {lead && <span className="mt-1 block font-medium text-foreground">{getLeadTitle(lead).title}</span>}
          </SidePanelDescription>
        </SidePanelHeader>

        <div className="space-y-3">
          {picking && open && <LeadPickerField value={pickedLeadId} onChange={setPickedLeadId} disabled={busy} />}

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

        <SidePanelFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {tCommon("cancel")}
          </Button>
          <Button onClick={() => void submit()} disabled={busy || dateInvalid || !leadId} aria-busy={busy}>
            {busy && <Loader2 className="animate-spin" />}
            {t2("submit")}
          </Button>
        </SidePanelFooter>
      </SidePanelContent>
    </SidePanel>
  );
}

/** Aday seçeneği: kurum / kişi, yetkili ve telefon (aynı adlı adaylar ayırt edilsin; telefonla da aranır). */
function leadOptionLabel(lead: CrmLead): string {
  const { title, subtitle } = getLeadTitle(lead);
  return [title, subtitle, lead.contactPhone ? formatPhone(lead.contactPhone) : null].filter(Boolean).join(" · ");
}

/**
 * "Aday" — Görevlerim'deki "Görev ekle"de görevin adayı (paylaşılan aday önbelleğinden; Adaylar ve Görevlerim aynı listeyi
 * kullanır). CRM'de olmayan kişiye görev eklenmez: önce aday eklenir.
 */
function LeadPickerField({ value, onChange, disabled }: { value: string; onChange: (id: string) => void; disabled: boolean }) {
  const t = useTranslations("crm.tasks.assign");
  const { leads, isLoading } = useAllCrmLeads();
  const options = useMemo(
    () => leads.map((l) => ({ value: l.id, label: leadOptionLabel(l) })).sort((a, b) => a.label.localeCompare(b.label, "tr")),
    [leads]
  );
  return (
    <div className="space-y-1.5">
      <Label htmlFor="assign-lead">{t("lead")}</Label>
      <Combobox
        id="assign-lead"
        value={value}
        onChange={onChange}
        options={options}
        placeholder={isLoading ? t("leadLoading") : t("leadPlaceholder")}
        emptyText={t("leadEmpty")}
        clearLabel={t("leadClear")}
        disabled={disabled || isLoading}
        aria-describedby="assign-lead-hint"
      />
      <p id="assign-lead-hint" className="text-xs text-muted-foreground">
        {t("leadHint")}
      </p>
    </div>
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
