"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, FileText, Loader2, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SidePanel, SidePanelContent, SidePanelDescription, SidePanelFooter, SidePanelHeader, SidePanelTitle } from "@/components/ui/side-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiErrorMessage } from "@/lib/hooks/use-api-error-message";
import { meetingTemplate } from "@/lib/domain/kca/rules";
import {
  KCA_LIMITS,
  KCA_MEETING_STATUSES,
  kcaMeetingCreateSchema,
  kcaMeetingPatchSchema,
  type KcaMeetingDto,
  type KcaMeetingPatchInput,
  type KcaMeetingStatus,
} from "@/lib/domain/kca/types";
import { useCreateKcaMeeting, useDeleteKcaMeeting, usePatchKcaMeeting, useSetKcaMeetingProcessed } from "../mutations";
import { useKcaMeeting } from "../queries";
import { MeetingMarkdown } from "./MeetingMarkdown";
import { NewTaskPanel } from "./TaskPanels";
import { Field, Pill, ProjectBadge, ProjectSelect, TEXTAREA_CLASS, TaskStatusPill, formatDay, formatStamp, useReadySession } from "./shared";

const AUTO = "__auto__";

export function MeetingAiPill({ meeting }: { meeting: Pick<KcaMeetingDto, "ai" | "processedAt"> }) {
  const t = useTranslations("management.meetings.ai");
  if (!meeting.ai) return <span className="text-xs text-muted-foreground">{t("off")}</span>;
  return meeting.processedAt ? <Pill tone="emerald">{t("done")}</Pill> : <Pill tone="amber">{t("waiting")}</Pill>;
}

export function useVisibilityLabel() {
  const t = useTranslations("management.meetings.visibility");
  return (m: KcaMeetingDto) => (m.isOwner ? (m.shared ? t("shared") : t("private")) : t("sharedBy", { name: m.ownerName ?? "—" }));
}

/**
 * Toplantı notu formu (yeni / düzenle). Yeni notta konu, tarih ve katılanlar boş bırakılabilir: sunucu nottaki
 * "Konu:", "Tarih:", "Katılanlar:" satırlarından okur (KCA Panel ile aynı kural).
 */
export function MeetingFormPanel({
  open,
  onOpenChange,
  meeting,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meeting?: KcaMeetingDto | null;
  onSaved?: (id: number) => void;
}) {
  const t = useTranslations("management.meetings.form");
  const tc = useTranslations("management.common");
  const tm = useTranslations("management.meetingStatus");
  const errorMessage = useApiErrorMessage();
  const session = useReadySession();
  const create = useCreateKcaMeeting();
  const patch = usePatchKcaMeeting(meeting?.id ?? 0);
  const editing = !!meeting;
  const projects = session.projects.filter((p) => !p.archived || p.id === meeting?.projectId);
  const root = projects.find((p) => p.parentId === null) ?? projects[0];

  const [body, setBody] = useState(meeting?.body ?? "");
  const [projectId, setProjectId] = useState<number | null>(meeting?.projectId ?? root?.id ?? null);
  const [title, setTitle] = useState(meeting?.title ?? "");
  const [date, setDate] = useState(meeting?.meetingDate ?? "");
  const [participants, setParticipants] = useState(meeting?.participants ?? "");
  const [status, setStatus] = useState<KcaMeetingStatus | typeof AUTO>(meeting?.status ?? AUTO);
  const [ai, setAi] = useState(meeting?.ai ?? true);
  const [shared, setShared] = useState(meeting?.shared ?? false);
  const [error, setError] = useState<string | null>(null);
  const busy = create.isPending || patch.isPending;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    try {
      if (meeting) {
        const raw: KcaMeetingPatchInput = {};
        if (body !== meeting.body) raw.body = body;
        if (projectId !== meeting.projectId && projectId) raw.projectId = projectId;
        if (title !== meeting.title) raw.title = title;
        if (date && date !== meeting.meetingDate) raw.date = date;
        if ((participants.trim() || null) !== meeting.participants) raw.participants = participants;
        if (status !== AUTO && status !== meeting.status) raw.status = status;
        if (ai !== meeting.ai) raw.ai = ai;
        if (shared !== meeting.shared) raw.shared = shared;
        if (!Object.keys(raw).length) {
          onOpenChange(false);
          return;
        }
        const parsed = kcaMeetingPatchSchema.safeParse(raw);
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? tc("error"));
          return;
        }
        setError(null);
        await patch.mutateAsync(parsed.data);
        toast.success(t("updated"));
        onOpenChange(false);
        onSaved?.(meeting.id);
      } else {
        const parsed = kcaMeetingCreateSchema.safeParse({
          body,
          projectId,
          title,
          date,
          participants,
          status: status === AUTO ? null : status,
          ai,
          shared,
        });
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? tc("error"));
          return;
        }
        setError(null);
        const d = await create.mutateAsync(parsed.data);
        toast.success(t("created"));
        onOpenChange(false);
        onSaved?.(d.meeting.id);
      }
    } catch (err) {
      setError(errorMessage(err, tc("error")));
    }
  };

  return (
    <SidePanel open={open} onOpenChange={onOpenChange}>
      <SidePanelContent size="2xl">
        <form onSubmit={submit} noValidate className="flex min-h-full flex-col">
          <SidePanelHeader>
            <SidePanelTitle>{editing ? t("editTitle") : t("newTitle")}</SidePanelTitle>
            <SidePanelDescription>{t("description")}</SidePanelDescription>
          </SidePanelHeader>
          <div className="flex-1 space-y-3">
            <Field label={t("body")} htmlFor="mf-body">
              <textarea
                id="mf-body"
                className={`${TEXTAREA_CLASS} min-h-[280px] font-mono text-xs md:text-xs`}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={KCA_LIMITS.meetingBody}
                disabled={busy}
                autoFocus={!editing}
              />
            </Field>
            {!editing && !body.trim() && (
              <Button type="button" size="sm" variant="outline" onClick={() => setBody(meetingTemplate(session.today))}>
                <FileText />
                {t("template")}
              </Button>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("project")} htmlFor="mf-project">
                <ProjectSelect id="mf-project" projects={projects} value={projectId} onChange={setProjectId} disabled={busy} />
              </Field>
              <Field label={t("title")} htmlFor="mf-title" hint={editing ? undefined : t("titleHint")}>
                <Input id="mf-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={KCA_LIMITS.meetingTitle} disabled={busy} />
              </Field>
              <Field label={t("date")} htmlFor="mf-date" hint={editing ? undefined : t("dateHint")}>
                <Input id="mf-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={busy} />
              </Field>
              <Field label={t("status")} htmlFor="mf-status">
                <Select value={status} onValueChange={(v) => setStatus(v as KcaMeetingStatus | typeof AUTO)} disabled={busy}>
                  <SelectTrigger id="mf-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {!editing && <SelectItem value={AUTO}>{t("statusAuto")}</SelectItem>}
                    {KCA_MEETING_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {tm(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t("participants")} htmlFor="mf-participants" className="sm:col-span-2">
                <Input
                  id="mf-participants"
                  value={participants}
                  onChange={(e) => setParticipants(e.target.value)}
                  maxLength={KCA_LIMITS.meetingParticipants}
                  disabled={busy}
                />
              </Field>
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox checked={ai} onCheckedChange={(v) => setAi(v === true)} disabled={busy} />
                {t("ai")}
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox checked={shared} onCheckedChange={(v) => setShared(v === true)} disabled={busy} />
                {t("shared")}
              </label>
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          <SidePanelFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tc("cancel")}
            </Button>
            <Button type="submit" disabled={busy || !body.trim() || !projectId} aria-busy={busy}>
              {busy && <Loader2 className="animate-spin" />}
              {t("submit")}
            </Button>
          </SidePanelFooter>
        </form>
      </SidePanelContent>
    </SidePanel>
  );
}

function DeleteMeetingButton({ id, onDeleted }: { id: number; onDeleted: () => void }) {
  const tc = useTranslations("management.common");
  const errorMessage = useApiErrorMessage();
  const remove = useDeleteKcaMeeting();
  const [open, setOpen] = useState(false);
  const confirm = async () => {
    try {
      await remove.mutateAsync(id);
      setOpen(false);
      toast.success(tc("deleted"));
      onDeleted();
    } catch (err) {
      toast.error(errorMessage(err, tc("error")));
    }
  };
  return (
    <>
      <Button variant="destructive-outline" size="sm" onClick={() => setOpen(true)}>
        <Trash2 />
        {tc("delete")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{tc("deleteTitle")}</DialogTitle>
            <DialogDescription>{tc("deleteMeetingBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button variant="destructive" onClick={confirm} disabled={remove.isPending}>
              {remove.isPending && <Loader2 className="animate-spin" />}
              {tc("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** "AI ekip bekliyor / İşlendi" şeridi; sahibi "İşlendi say" ya da "Yeniden aç" der. */
function ProcessedBanner({ meeting }: { meeting: KcaMeetingDto }) {
  const t = useTranslations("management.meetings.detail");
  const tc = useTranslations("management.common");
  const errorMessage = useApiErrorMessage();
  const set = useSetKcaMeetingProcessed(meeting.id);
  const [result, setResult] = useState("");
  const run = async (done: boolean) => {
    try {
      await set.mutateAsync({ done, result: done ? result.trim() || null : null });
      setResult("");
      toast.success(tc("saved"));
    } catch (err) {
      toast.error(errorMessage(err, tc("error")));
    }
  };
  if (!meeting.ai) return null;
  if (meeting.processedAt) {
    return (
      <div className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">
        <div>
          <span className="font-medium">{t("processed")}</span> {meeting.result && <span className="whitespace-pre-wrap">{meeting.result}</span>}
          <p className="text-xs text-muted-foreground">{t("processedBy", { name: meeting.processedByName ?? "—", date: formatStamp(meeting.processedAt) })}</p>
        </div>
        {meeting.isOwner && (
          <Button size="sm" variant="outline" onClick={() => run(false)} disabled={set.isPending}>
            <RotateCcw />
            {t("reopen")}
          </Button>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
      <p>{t("waiting")}</p>
      {meeting.isOwner && (
        <div className="flex flex-wrap gap-2">
          <Input className="h-8 min-w-[220px] flex-1 text-xs" value={result} onChange={(e) => setResult(e.target.value)} placeholder={t("resultPlaceholder")} maxLength={KCA_LIMITS.result} />
          <Button size="sm" variant="success-outline" onClick={() => run(true)} disabled={set.isPending}>
            {set.isPending ? <Loader2 className="animate-spin" /> : <Check />}
            {t("markDone")}
          </Button>
        </div>
      )}
    </div>
  );
}

/** Toplantı ayrıntısı (sağdan panel): not (tablo ve başlıklarıyla), çıkan görevler, işlendi durumu. */
export function MeetingDetailPanel({ meetingId, onClose, onOpenTask }: { meetingId: number | null; onClose: () => void; onOpenTask: (id: number) => void }) {
  const t = useTranslations("management.meetings.detail");
  const tc = useTranslations("management.common");
  const tm = useTranslations("management.meetingStatus");
  const errorMessage = useApiErrorMessage();
  const session = useReadySession();
  const visibility = useVisibilityLabel();
  const query = useKcaMeeting(meetingId);
  const [editing, setEditing] = useState(false);
  const [newTask, setNewTask] = useState(false);
  const detail = query.data;
  const m = detail?.meeting;
  const canCreateTask = session.projects.some((p) => p.canCreateTasks && !p.archived);

  return (
    <>
      <SidePanel open={meetingId !== null && !editing && !newTask} onOpenChange={(open) => !open && onClose()}>
        <SidePanelContent size="2xl">
          {!m ? (
            <>
              <SidePanelHeader>
                <SidePanelTitle>{t("loading")}</SidePanelTitle>
                <SidePanelDescription className="sr-only">{t("loading")}</SidePanelDescription>
              </SidePanelHeader>
              {query.isError ? <p className="text-sm text-destructive">{errorMessage(query.error, tc("error"))}</p> : <Skeleton className="h-64 w-full rounded-xl" />}
            </>
          ) : (
            <>
              <SidePanelHeader>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <ProjectBadge name={m.projectName} color={m.projectColor} className="text-xs" />
                  <span>{formatDay(m.meetingDate)}</span>
                  <Pill tone={m.status === "planned" ? "sky" : "muted"}>{tm(m.status)}</Pill>
                  <span>{visibility(m)}</span>
                </div>
                <SidePanelTitle>{m.title}</SidePanelTitle>
                <SidePanelDescription>{m.participants || t("owner", { name: m.ownerName ?? "—" })}</SidePanelDescription>
              </SidePanelHeader>
              <div className="space-y-5 pb-2">
                <ProcessedBanner meeting={m} />
                <section className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">{t("tasks", { count: detail.tasks.length })}</h3>
                    {canCreateTask && (
                      <Button size="sm" variant="outline" onClick={() => setNewTask(true)}>
                        <Plus />
                        {t("newTask")}
                      </Button>
                    )}
                  </div>
                  {detail.tasks.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t("noTasks")}</p>
                  ) : (
                    <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
                      {detail.tasks.map((task) => (
                        <li key={task.id}>
                          <button type="button" onClick={() => onOpenTask(task.id)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left text-sm hover:bg-accent/50">
                            <span className="min-w-0 flex-1 font-medium">{task.title}</span>
                            <span className="text-xs text-muted-foreground">{task.assigneeName ?? tc("unassigned")}</span>
                            <span className="text-xs tabular-nums text-muted-foreground">{formatDay(task.dueDate)}</span>
                            <TaskStatusPill status={task.status} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
                <section className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">{t("notes")}</h3>
                    {m.isOwner && (
                      <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                        <Pencil />
                        {t("edit")}
                      </Button>
                    )}
                  </div>
                  <div className="rounded-xl border border-border/60 p-4">
                    <MeetingMarkdown body={m.body} />
                  </div>
                </section>
              </div>
              {m.isOwner && (
                <SidePanelFooter>
                  <DeleteMeetingButton id={m.id} onDeleted={onClose} />
                </SidePanelFooter>
              )}
            </>
          )}
        </SidePanelContent>
      </SidePanel>
      {m && editing && <MeetingFormPanel open={editing} onOpenChange={setEditing} meeting={m} />}
      {m && newTask && (
        <NewTaskPanel open={newTask} onOpenChange={setNewTask} meeting={{ id: m.id, title: m.title, projectId: m.projectId }} />
      )}
    </>
  );
}
