"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, Loader2 } from "lucide-react";
import { SidePanel, SidePanelContent, SidePanelDescription, SidePanelFooter, SidePanelHeader, SidePanelTitle } from "@/components/ui/side-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryErrorState } from "@/components/query-error-state";
import { cn } from "@/lib/utils";
import { useCreateCrmNote, useLeadNotes } from "@/features/crm-notes";
import { useApiErrorMessage } from "@/lib/hooks/use-api-error-message";
import type { CrmNote } from "@/lib/domain/crm-notes/types";
import {
  DISSATISFACTION_CATEGORIES,
  DISSATISFACTION_SEVERITIES,
  DISSATISFACTION_STATUSES,
  PROGRAM_TAGS,
  buildDissatisfactionNote,
  buildNoteContent,
  buildProgramNote,
  latestDissatisfaction,
  latestFollowUpDate,
  parseNoteContent,
  programTags,
  type DissatisfactionCategory,
  type DissatisfactionSeverity,
  type DissatisfactionStatus,
  type ProgramTag,
} from "@/lib/domain/crm-notes/utils";
import { addDaysIso } from "@/lib/domain/crm/offer";
import type { CrmLead, CrmNoteMode } from "@/lib/domain/crm/types";
import { formatCrmDate, getLeadDisplayName } from "@/lib/domain/crm/utils";
import { useInvalidateCrm } from "../mutations";
import { ProgramBadges, ToneBadge } from "./CrmBadges";
import { CrmNoteList, TEXTAREA_CLASS } from "./CrmNoteList";

export interface CrmNoteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: CrmLead | null;
  /** Açılışta seçili form: düz not, şikâyet kaydı ya da devir notu. */
  mode?: CrmNoteMode;
}

/** Aday notları: geçmiş + yeni not (düz / şikâyet kaydı / satış sonrası devir). Yazar oturumdan yazılır. */
export function CrmNoteModal({ open, onOpenChange, lead, mode = "note" }: CrmNoteModalProps) {
  const t = useTranslations("crm.notes");
  return (
    <SidePanel open={open} onOpenChange={onOpenChange}>
      <SidePanelContent size="lg">
        <SidePanelHeader>
          <SidePanelTitle>{t("title")}</SidePanelTitle>
          <SidePanelDescription>
            {t("description")}
            {lead && <span className="mt-1 block font-medium text-foreground">{getLeadDisplayName(lead)}</span>}
          </SidePanelDescription>
        </SidePanelHeader>
        {/* key: her açılışta (başka aday / mod) form sıfırlanır */}
        {open && lead && <NoteBody key={`${lead.id}:${mode}`} lead={lead} initialMode={mode} onClose={() => onOpenChange(false)} />}
      </SidePanelContent>
    </SidePanel>
  );
}

/** Şikâyet ve program etiketleri aday listesindeki rozetleri değiştirir: listeyi tazele. */
const affectsBadges = (content: string) => {
  const tag = parseNoteContent(content).tag;
  return tag === "SIKAYET" || tag === "PROGRAM";
};

function NoteBody({ lead, initialMode, onClose }: { lead: CrmLead; initialMode: CrmNoteMode; onClose: () => void }) {
  const t = useTranslations("crm.notes");
  const tDis = useTranslations("crm.dissatisfied");
  const tHand = useTranslations("crm.handoff");
  const tProg = useTranslations("crm.program");
  const tCommon = useTranslations("common");
  const errorMessage = useApiErrorMessage();
  const notes = useLeadNotes(lead.id);
  const createNote = useCreateCrmNote();
  const invalidateCrm = useInvalidateCrm();

  const [mode, setMode] = useState<CrmNoteMode>(initialMode);
  const [content, setContent] = useState(initialMode === "handoff" ? tHand("template") : "");
  const [category, setCategory] = useState<DissatisfactionCategory>("teknik");
  const [severity, setSeverity] = useState<DissatisfactionSeverity>("orta");
  const [disStatus, setDisStatus] = useState<DissatisfactionStatus>("acik");
  const [followUp, setFollowUp] = useState(() => addDaysIso(new Date(), 7));
  const [tags, setTags] = useState<ProgramTag[]>([]);

  const list = notes.data ?? [];
  const dissatisfaction = latestDissatisfaction(list);
  const followUpDate = latestFollowUpDate(list);
  const currentTags = programTags(list);
  const busy = createNote.isPending;
  const hasBody = mode === "dissatisfied" || !!content.trim() || (mode === "note" && tags.length > 0);
  const canSubmit = !busy && hasBody;
  const disabledReason = busy || hasBody ? null : t(mode === "note" ? "disabledReason.emptyNote" : "disabledReason.empty");

  const changeMode = (next: CrmNoteMode) => {
    setMode(next);
    if (next === "handoff" && !content.trim()) setContent(tHand("template"));
  };

  const onChanged = (note: Pick<CrmNote, "content">) => {
    if (affectsBadges(note.content)) invalidateCrm();
  };

  const save = (text: string) => {
    createNote.mutate(
      { leadId: lead.id, content: text },
      {
        onSuccess: (note) => {
          toast.success(t("saved"));
          setContent("");
          setTags([]);
          onChanged(note);
        },
        onError: (err) => toast.error(errorMessage(err, t("error"))),
      }
    );
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    if (mode === "dissatisfied") save(buildDissatisfactionNote({ category, severity, status: disStatus, description: content }));
    else if (mode === "handoff") save(buildNoteContent("DEVIR", [followUp], content));
    else save(buildProgramNote(tags, content));
  };

  const resolveDissatisfaction = () => {
    if (!dissatisfaction) return;
    save(
      buildDissatisfactionNote({
        category: dissatisfaction.category,
        severity: dissatisfaction.severity,
        status: "cozuldu",
        description: tDis("resolvedNote"),
      })
    );
  };

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
      {(dissatisfaction || followUpDate || currentTags.length > 0) && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {dissatisfaction?.status === "acik" && (
            <>
              <ToneBadge tone="red">
                {tDis("badge")} · {tDis(`category.${dissatisfaction.category}`)} · {tDis(`severity.${dissatisfaction.severity}`)}
              </ToneBadge>
              <Button variant="success-outline" size="sm" onClick={resolveDissatisfaction} disabled={busy}>
                <Check />
                {tDis("resolve")}
              </Button>
            </>
          )}
          {dissatisfaction?.status === "cozuldu" && <ToneBadge tone="gray">{tDis("resolvedBadge")}</ToneBadge>}
          <ProgramBadges tags={currentTags} />
          {followUpDate && <ToneBadge tone="yellow">{tHand("followUpBadge", { date: formatCrmDate(followUpDate) })}</ToneBadge>}
        </div>
      )}

      {notes.isLoading ? (
        <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3" aria-busy="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-md" />
          ))}
        </div>
      ) : notes.isError ? (
        <QueryErrorState onRetry={() => void notes.refetch()} />
      ) : list.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <CrmNoteList leadId={lead.id} notes={list} onChanged={onChanged} />
      )}

      <form onSubmit={onSubmit} className="space-y-3">
        <SegmentedControl
          value={mode}
          onValueChange={changeMode}
          aria-label={t("modeLabel")}
          options={[
            { value: "note", label: t("mode.note") },
            { value: "dissatisfied", label: t("mode.dissatisfied") },
            { value: "handoff", label: t("mode.handoff") },
          ]}
        />

        {mode === "dissatisfied" && (
          <ComplaintFields
            category={category}
            onCategory={setCategory}
            severity={severity}
            onSeverity={setSeverity}
            status={disStatus}
            onStatus={setDisStatus}
          />
        )}

        {mode === "note" && (
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={tProg("label")}>
              <span className="text-xs text-muted-foreground">{tProg("label")}:</span>
              {PROGRAM_TAGS.map((tag) => {
                const on = tags.includes(tag);
                return (
                  <Button
                    key={tag}
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-pressed={on}
                    onClick={() => setTags(on ? tags.filter((x) => x !== tag) : [...tags, tag])}
                    className={cn("h-7", on && "border-primary/50 bg-primary/10 text-foreground")}
                  >
                    {tProg(tag)}
                  </Button>
                );
              })}
            </div>
            {tags.length > 0 && <p className="text-xs text-muted-foreground">{tProg("hint")}</p>}
          </div>
        )}

        {mode === "handoff" && (
          <div className="space-y-1.5">
            <Label htmlFor="note-follow-up">{tHand("followUp")}</Label>
            <Input id="note-follow-up" type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)} className="w-44" />
            <p className="text-xs text-muted-foreground">{tHand("hint")}</p>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="note-content">{mode === "dissatisfied" ? tDis("descriptionLabel") : t("content")}</Label>
          <textarea
            id="note-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={t("contentPlaceholder")}
            rows={mode === "handoff" ? 7 : 3}
            maxLength={5000}
            disabled={busy}
            className={TEXTAREA_CLASS}
            aria-describedby={disabledReason ? "note-disabled-reason" : undefined}
          />
          {disabledReason && (
            <p id="note-disabled-reason" className="text-xs text-muted-foreground">
              {disabledReason}
            </p>
          )}
        </div>
        <SidePanelFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            {tCommon("cancel")}
          </Button>
          <Button type="submit" disabled={!canSubmit} aria-busy={busy}>
            {busy ? (
              <>
                <Loader2 className="animate-spin" />
                {tCommon("saving")}
              </>
            ) : (
              t("submit")
            )}
          </Button>
        </SidePanelFooter>
      </form>
    </div>
  );
}

function ComplaintFields({
  category,
  onCategory,
  severity,
  onSeverity,
  status,
  onStatus,
}: {
  category: DissatisfactionCategory;
  onCategory: (v: DissatisfactionCategory) => void;
  severity: DissatisfactionSeverity;
  onSeverity: (v: DissatisfactionSeverity) => void;
  status: DissatisfactionStatus;
  onStatus: (v: DissatisfactionStatus) => void;
}) {
  const tDis = useTranslations("crm.dissatisfied");
  const select = <T extends string>(label: string, value: T, onChange: (v: T) => void, options: readonly T[], key: string) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={(v) => onChange(v as T)}>
        <SelectTrigger aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {tDis(`${key}.${String(o)}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
  return (
    <>
      <p className="text-xs text-muted-foreground">{tDis("noScoreHint")}</p>
      <div className="grid grid-cols-3 gap-2">
        {select(tDis("categoryLabel"), category, onCategory, DISSATISFACTION_CATEGORIES, "category")}
        {select(tDis("severityLabel"), severity, onSeverity, DISSATISFACTION_SEVERITIES, "severity")}
        {select(tDis("statusLabel"), status, onStatus, DISSATISFACTION_STATUSES, "status")}
      </div>
    </>
  );
}
