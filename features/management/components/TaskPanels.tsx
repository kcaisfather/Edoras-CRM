"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, Loader2, NotebookPen, Trash2, Undo2 } from "lucide-react";
import { Link } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SidePanel, SidePanelContent, SidePanelDescription, SidePanelFooter, SidePanelHeader, SidePanelTitle } from "@/components/ui/side-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiErrorMessage } from "@/lib/hooks/use-api-error-message";
import {
  KCA_LIMITS,
  KCA_PRIORITIES,
  KCA_TASK_STATUSES,
  kcaTaskCreateSchema,
  type KcaPriority,
  type KcaTaskDetailDto,
  type KcaTaskEventDto,
  type KcaTaskPatchInput,
  type KcaTaskStatus,
} from "@/lib/domain/kca/types";
import { useApproveKcaTask, useCommentKcaTask, useCreateKcaTask, useDeleteKcaTask, usePatchKcaTask, useRequestKcaChanges } from "../mutations";
import { useKcaTask } from "../queries";
import { AssigneeSelect, Field, ProjectBadge, ProjectSelect, TEXTAREA_CLASS, TaskStatusPill, formatDay, formatStamp, membersOf, useReadySession } from "./shared";

function useEventText() {
  const tt = useTranslations("management.tasks.detail");
  const ts = useTranslations("management.taskStatus");
  return (e: KcaTaskEventDto) => {
    const who = e.userName ?? tt("someone");
    const status = (v: string | null) => (v && (KCA_TASK_STATUSES as readonly string[]).includes(v) ? ts(v as KcaTaskStatus) : "—");
    switch (e.kind) {
      case "created":
      case "approved":
      case "changes_requested":
        return tt(`event.${e.kind}`, { who });
      case "status":
        return tt("event.status", { who, from: status(e.oldValue), to: status(e.newValue) });
      case "due_date":
        return tt("event.due_date", { who, from: e.oldValue ? formatDay(e.oldValue) : tt("noDate"), to: e.newValue ? formatDay(e.newValue) : tt("noDate") });
      case "project":
        return tt("event.project", { who, from: e.oldValue ?? "—", to: e.newValue ?? "—" });
      case "assignee":
        return tt("event.assignee", { who, from: e.oldValue ?? "—", to: e.newValue ?? "—" });
      default:
        return tt("event.other", { who, kind: e.kind });
    }
  };
}

function DeleteTaskButton({ id, onDeleted }: { id: number; onDeleted: () => void }) {
  const tc = useTranslations("management.common");
  const errorMessage = useApiErrorMessage();
  const remove = useDeleteKcaTask();
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
            <DialogDescription>{tc("deleteTaskBody")}</DialogDescription>
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

/** "Onay bekliyor" kutusu: ✓ OK (isteğe bağlı not) ya da Düzeltme iste (zorunlu not). */
function ReviewBox({ id }: { id: number }) {
  const t = useTranslations("management.tasks.detail");
  const tc = useTranslations("management.common");
  const errorMessage = useApiErrorMessage();
  const approve = useApproveKcaTask(id);
  const changes = useRequestKcaChanges(id);
  const [note, setNote] = useState("");
  const busy = approve.isPending || changes.isPending;
  const run = async (kind: "approve" | "changes") => {
    try {
      if (kind === "approve") {
        await approve.mutateAsync(note.trim() || null);
        toast.success(t("approved"));
      } else {
        await changes.mutateAsync(note.trim());
        toast.success(t("changesRequested"));
      }
      setNote("");
    } catch (err) {
      toast.error(errorMessage(err, tc("error")));
    }
  };
  return (
    <div className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
      <p className="text-sm font-medium">{t("review")}</p>
      <textarea
        className={TEXTAREA_CLASS}
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={`${t("approveNote")} · ${t("changesNote")}`}
        maxLength={KCA_LIMITS.comment}
        disabled={busy}
      />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="success-outline" onClick={() => run("approve")} disabled={busy}>
          {approve.isPending ? <Loader2 className="animate-spin" /> : <Check />}
          {t("approve")}
        </Button>
        <Button size="sm" variant="outline" onClick={() => run("changes")} disabled={busy || !note.trim()}>
          {changes.isPending ? <Loader2 className="animate-spin" /> : <Undo2 />}
          {t("requestChanges")}
        </Button>
      </div>
    </div>
  );
}

/** Bilgi alanları (yapılacak, konu, not, öncelik) — görev girme yetkisiyle düzenlenir; yalnız değişenler gönderilir. */
function DetailsForm({ detail, onSave, busy }: { detail: KcaTaskDetailDto; onSave: (body: KcaTaskPatchInput) => void; busy: boolean }) {
  const t = useTranslations("management.tasks.detail");
  const tp = useTranslations("management.priority");
  const task = detail.task;
  const [title, setTitle] = useState(task.title);
  const [subject, setSubject] = useState(task.subject ?? "");
  const [description, setDescription] = useState(task.description ?? "");
  const [priority, setPriority] = useState<KcaPriority>(task.priority);
  const editable = detail.perms.canCreateTasks;

  const diff: KcaTaskPatchInput = {};
  if (title.trim() !== task.title) diff.title = title;
  if ((subject.trim() || null) !== task.subject) diff.subject = subject;
  if ((description.trim() || null) !== task.description) diff.description = description;
  if (priority !== task.priority) diff.priority = priority;
  const dirty = Object.keys(diff).length > 0 && title.trim().length > 0;

  return (
    <div className="space-y-3">
      <Field label={t("title")} htmlFor="kt-title">
        <Input id="kt-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={KCA_LIMITS.taskTitle} disabled={!editable || busy} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("subject")} htmlFor="kt-subject">
          <Input id="kt-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={KCA_LIMITS.taskSubject} disabled={!editable || busy} />
        </Field>
        <Field label={t("priority")} htmlFor="kt-priority">
          <Select value={priority} onValueChange={(v) => setPriority(v as KcaPriority)} disabled={!editable || busy}>
            <SelectTrigger id="kt-priority">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KCA_PRIORITIES.map((p) => (
                <SelectItem key={p} value={p}>
                  {tp(p)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field label={t("notes")} htmlFor="kt-notes">
        <textarea
          id="kt-notes"
          className={TEXTAREA_CLASS}
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={KCA_LIMITS.taskDescription}
          disabled={!editable || busy}
        />
      </Field>
      {editable && (
        <Button size="sm" onClick={() => onSave(diff)} disabled={!dirty || busy}>
          {busy && <Loader2 className="animate-spin" />}
          {t("saveDetails")}
        </Button>
      )}
    </div>
  );
}

/** Görev ayrıntısı (sağdan panel): durum / sorumlu / son tarih / proje anında kaydedilir; onay; güncellemeler; geçmiş. */
export function TaskDetailPanel({ taskId, onClose }: { taskId: number | null; onClose: () => void }) {
  const t = useTranslations("management.tasks.detail");
  const tc = useTranslations("management.common");
  const ts = useTranslations("management.taskStatus");
  const errorMessage = useApiErrorMessage();
  const session = useReadySession();
  const query = useKcaTask(taskId);
  const patch = usePatchKcaTask(taskId ?? 0);
  const comment = useCommentKcaTask(taskId ?? 0);
  const eventText = useEventText();
  const [note, setNote] = useState("");
  const detail = query.data;

  const save = async (body: KcaTaskPatchInput) => {
    try {
      await patch.mutateAsync(body);
      toast.success(tc("saved"));
    } catch (err) {
      toast.error(errorMessage(err, tc("error")));
    }
  };

  const addComment = async () => {
    const body = note.trim();
    if (!body || comment.isPending) return;
    try {
      await comment.mutateAsync(body);
      setNote("");
    } catch (err) {
      toast.error(errorMessage(err, tc("error")));
    }
  };

  const perms = detail?.perms;
  const canStatus = !!perms && (perms.canCreateTasks || perms.isAssignee);
  const movable = session.projects.filter((p) => p.canCreateTasks && (!p.archived || p.id === detail?.task.projectId));

  return (
    <SidePanel open={taskId !== null} onOpenChange={(open) => !open && onClose()}>
      <SidePanelContent size="xl">
        {!detail ? (
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
              <div className="flex flex-wrap items-center gap-2">
                <ProjectBadge name={detail.task.projectName} color={detail.task.projectColor} className="text-xs text-muted-foreground" />
                <TaskStatusPill status={detail.task.status} />
              </div>
              <SidePanelTitle>{detail.task.title}</SidePanelTitle>
              <SidePanelDescription>
                {t("createdBy", { name: detail.task.createdByName ?? t("someone"), date: formatStamp(detail.task.createdAt) })}
              </SidePanelDescription>
            </SidePanelHeader>

            <div className="space-y-5 pb-2">
              {detail.task.status === "review" && perms?.canCreateTasks && <ReviewBox id={detail.task.id} />}
              {!perms?.canCreateTasks && <p className="rounded-lg bg-muted/50 p-2 text-xs text-muted-foreground">{t("readOnly")}</p>}

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t("status")} htmlFor="kt-status">
                  <Select value={detail.task.status} onValueChange={(v) => save({ status: v as KcaTaskStatus })} disabled={!canStatus || patch.isPending}>
                    <SelectTrigger id="kt-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {KCA_TASK_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {ts(s)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={t("assignee")} htmlFor="kt-assignee">
                  <AssigneeSelect
                    id="kt-assignee"
                    members={detail.members}
                    value={detail.task.assigneeId}
                    onChange={(v) => save({ assigneeId: v })}
                    disabled={!perms?.canCreateTasks || patch.isPending}
                  />
                </Field>
                <Field label={t("due")} htmlFor="kt-due">
                  <Input
                    id="kt-due"
                    type="date"
                    defaultValue={detail.task.dueDate ?? ""}
                    key={detail.task.dueDate ?? "none"}
                    onBlur={(e) => {
                      const v = e.target.value || null;
                      if (v !== detail.task.dueDate) void save({ dueDate: v });
                    }}
                    disabled={!perms?.canEditDueDates || patch.isPending}
                  />
                </Field>
                <Field label={t("project")} htmlFor="kt-project">
                  <ProjectSelect
                    id="kt-project"
                    projects={movable.some((p) => p.id === detail.task.projectId) ? movable : session.projects}
                    value={detail.task.projectId}
                    onChange={(id) => id !== detail.task.projectId && save({ projectId: id })}
                    disabled={!perms?.canCreateTasks || patch.isPending}
                  />
                </Field>
              </div>

              {detail.task.meetingId && (
                <Link href={`/management/meetings?meeting=${detail.task.meetingId}`} className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
                  <NotebookPen className="size-4" />
                  {t("meeting")}
                </Link>
              )}

              <DetailsForm key={detail.task.updatedAt} detail={detail} onSave={save} busy={patch.isPending} />

              <section className="space-y-2">
                <h3 className="text-sm font-semibold">{t("comments")}</h3>
                {detail.comments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("noComments")}</p>
                ) : (
                  <ul className="space-y-2">
                    {detail.comments.map((c) => (
                      <li key={c.id} className="rounded-lg border border-border/60 p-2.5 text-sm">
                        <p className="whitespace-pre-wrap break-words">{c.body}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {c.userName ?? t("someone")} · {formatStamp(c.createdAt)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex gap-2">
                  <textarea
                    className={TEXTAREA_CLASS}
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={t("commentPlaceholder")}
                    maxLength={KCA_LIMITS.comment}
                    disabled={comment.isPending}
                  />
                  <Button size="sm" className="self-end" onClick={addComment} disabled={!note.trim() || comment.isPending}>
                    {comment.isPending && <Loader2 className="animate-spin" />}
                    {t("addComment")}
                  </Button>
                </div>
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold">{t("history")}</h3>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {detail.events.map((e, i) => (
                    <li key={i}>
                      <span className="tabular-nums">{formatStamp(e.createdAt)}</span> · {eventText(e)}
                    </li>
                  ))}
                </ul>
              </section>
            </div>

            {perms?.canCreateTasks && (
              <SidePanelFooter>
                <DeleteTaskButton id={detail.task.id} onDeleted={onClose} />
              </SidePanelFooter>
            )}
          </>
        )}
      </SidePanelContent>
    </SidePanel>
  );
}

/** Yeni görev (sağdan panel). Toplantıdan açılırsa toplantıya bağlanır ve proje toplantınınki olur. */
export function NewTaskPanel({
  open,
  onOpenChange,
  onCreated,
  meeting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (id: number) => void;
  meeting?: { id: number; title: string; projectId: number } | null;
}) {
  const t = useTranslations("management.tasks.form");
  const tc = useTranslations("management.common");
  const tp = useTranslations("management.priority");
  const errorMessage = useApiErrorMessage();
  const session = useReadySession();
  const create = useCreateKcaTask();
  const projects = session.projects.filter((p) => p.canCreateTasks && !p.archived);
  const initialProject = meeting && projects.some((p) => p.id === meeting.projectId) ? meeting.projectId : (projects[0]?.id ?? null);

  const [projectId, setProjectId] = useState<number | null>(initialProject);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeId, setAssigneeId] = useState<number | null>(session.user.id);
  const [priority, setPriority] = useState<KcaPriority>("normal");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  const members = membersOf(session.members, projectId);
  const assignee = assigneeId !== null && members.some((m) => m.id === assigneeId) ? assigneeId : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (create.isPending) return;
    const parsed = kcaTaskCreateSchema.safeParse({ projectId, title, subject, description, assigneeId: assignee, priority, dueDate, meetingId: meeting?.id ?? null });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? tc("error"));
      return;
    }
    setError(null);
    try {
      const d = await create.mutateAsync(parsed.data);
      toast.success(t("created"));
      setTitle("");
      setSubject("");
      setDescription("");
      setDueDate("");
      onOpenChange(false);
      onCreated?.(d.task.id);
    } catch (err) {
      setError(errorMessage(err, tc("error")));
    }
  };

  return (
    <SidePanel open={open} onOpenChange={onOpenChange}>
      <SidePanelContent size="lg">
        <form onSubmit={submit} noValidate className="flex min-h-full flex-col">
          <SidePanelHeader>
            <SidePanelTitle>{t("title")}</SidePanelTitle>
            <SidePanelDescription>{meeting ? t("meeting", { title: meeting.title }) : t("description")}</SidePanelDescription>
          </SidePanelHeader>
          {projects.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noProject")}</p>
          ) : (
            <div className="flex-1 space-y-3">
              <Field label={t("project")} htmlFor="nt-project">
                <ProjectSelect id="nt-project" projects={projects} value={projectId} onChange={setProjectId} disabled={create.isPending} />
              </Field>
              <Field label={t("taskTitle")} htmlFor="nt-title">
                <Input id="nt-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={KCA_LIMITS.taskTitle} disabled={create.isPending} autoFocus />
              </Field>
              <Field label={t("subject")} htmlFor="nt-subject" hint={t("subjectHint")}>
                <Input id="nt-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={KCA_LIMITS.taskSubject} disabled={create.isPending} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label={t("assignee")} htmlFor="nt-assignee">
                  <AssigneeSelect id="nt-assignee" members={members} value={assignee} onChange={setAssigneeId} disabled={create.isPending} />
                </Field>
                <Field label={t("priority")} htmlFor="nt-priority">
                  <Select value={priority} onValueChange={(v) => setPriority(v as KcaPriority)} disabled={create.isPending}>
                    <SelectTrigger id="nt-priority">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {KCA_PRIORITIES.map((p) => (
                        <SelectItem key={p} value={p}>
                          {tp(p)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={t("due")} htmlFor="nt-due">
                  <Input id="nt-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} disabled={create.isPending} />
                </Field>
              </div>
              <Field label={t("notes")} htmlFor="nt-notes">
                <textarea
                  id="nt-notes"
                  className={TEXTAREA_CLASS}
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={KCA_LIMITS.taskDescription}
                  disabled={create.isPending}
                />
              </Field>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
            </div>
          )}
          <SidePanelFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tc("cancel")}
            </Button>
            <Button type="submit" disabled={create.isPending || projects.length === 0} aria-busy={create.isPending}>
              {create.isPending && <Loader2 className="animate-spin" />}
              {t("submit")}
            </Button>
          </SidePanelFooter>
        </form>
      </SidePanelContent>
    </SidePanel>
  );
}
