"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { MessageSquare, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DesktopTable, MobileCard, MobileCardList, SearchBox } from "@/components/list";
import { useApiErrorMessage } from "@/lib/hooks/use-api-error-message";
import { useUrlParam } from "@/lib/hooks/use-url-param";
import { KCA_TASK_STATUSES, type KcaTaskDto, type KcaTaskStatus } from "@/lib/domain/kca/types";
import { cn } from "@/lib/utils";
import { managementApi } from "../api";
import { usePatchKcaTask } from "../mutations";
import { managementKeys, useKcaTasks } from "../queries";
import { ManagementGate } from "./ManagementGate";
import { NewTaskPanel, TaskDetailPanel } from "./TaskPanels";
import { ProjectBadge, ProjectTabs, TaskStatusPill, formatDay, formatStamp, matchesQuery, useReadySession } from "./shared";

const ALL = "__all__";
type StatusFilter = KcaTaskStatus | "open" | "overdue" | typeof ALL;

/** Satırdaki hızlı durum seçimi (görev girme yetkisi ya da görevin sorumlusu). */
function StatusCell({ task, editable }: { task: KcaTaskDto; editable: boolean }) {
  const ts = useTranslations("management.taskStatus");
  const tc = useTranslations("management.common");
  const tt = useTranslations("management.tasks");
  const errorMessage = useApiErrorMessage();
  const patch = usePatchKcaTask(task.id);
  if (!editable) return <TaskStatusPill status={task.status} />;
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <Select
        value={task.status}
        onValueChange={(v) =>
          patch.mutate({ status: v as KcaTaskStatus }, { onError: (err) => toast.error(errorMessage(err, tc("error"))) })
        }
        disabled={patch.isPending}
      >
        <SelectTrigger className="h-8 w-[150px] text-xs" aria-label={tt("col.status")}>
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
    </div>
  );
}

function TasksBoard({ openTask, setOpenTask }: { openTask: number | null; setOpenTask: (id: number | null) => void }) {
  const t = useTranslations("management.tasks");
  const ts = useTranslations("management.taskStatus");
  const tg = useTranslations("management.gate");
  const session = useReadySession();
  const query = useKcaTasks();
  const [projectId, setProjectId] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("open");
  const [mine, setMine] = useState(false);
  const today = session.today;
  const me = session.user.id;
  const projectById = useMemo(() => new Map(session.projects.map((p) => [p.id, p])), [session.projects]);

  const tasks = useMemo(() => query.data ?? [], [query.data]);
  const scoped = useMemo(() => {
    return tasks.filter((task) => {
      if (mine && task.assigneeId !== me) return false;
      if (status === "open" && task.status === "done") return false;
      if (status === "overdue" && !(task.status !== "done" && task.dueDate && task.dueDate < today)) return false;
      if (status !== "open" && status !== "overdue" && status !== ALL && task.status !== status) return false;
      return matchesQuery(q, task.title, task.subject, task.description, task.assigneeName, task.projectName);
    });
  }, [tasks, mine, me, status, today, q]);

  const counts = useMemo(() => {
    const m = new Map<number, number>();
    for (const task of scoped) m.set(task.projectId, (m.get(task.projectId) ?? 0) + 1);
    return m;
  }, [scoped]);
  // Alt projesi seçilen ana proje sekmesi kendi altındakileri de gösterir.
  const rows = projectId === null ? scoped : scoped.filter((x) => x.projectId === projectId || projectById.get(x.projectId)?.parentId === projectId);
  // Onay bekleyenler üstte, sonra son tarih.
  const sorted = [...rows].sort(
    (a, b) =>
      Number(b.status === "review") - Number(a.status === "review") ||
      Number(a.status === "done") - Number(b.status === "done") ||
      (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") ||
      a.id - b.id
  );
  const reviewCount = tasks.filter((x) => x.status === "review" && projectById.get(x.projectId)?.canCreateTasks).length;
  const editable = (task: KcaTaskDto) => !!projectById.get(task.projectId)?.canCreateTasks || task.assigneeId === me;
  const late = (task: KcaTaskDto) => task.status !== "done" && !!task.dueDate && task.dueDate < today;

  return (
    <div className="space-y-3">
      {session.projects.length === 0 && <p className="rounded-xl border border-border p-4 text-sm text-muted-foreground">{tg("noProjects")}</p>}
      <ProjectTabs projects={session.projects} counts={counts} value={projectId} onChange={setProjectId} />
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={q} onChange={setQ} placeholder={t("searchPlaceholder")} />
        <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
          <SelectTrigger className="h-9 w-[190px]" aria-label={t("statusFilter")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">{t("allStatuses")}</SelectItem>
            <SelectItem value="overdue">{t("overdue")}</SelectItem>
            {KCA_TASK_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {ts(s)}
              </SelectItem>
            ))}
            <SelectItem value={ALL}>{t("showDone")}</SelectItem>
          </SelectContent>
        </Select>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox checked={mine} onCheckedChange={(v) => setMine(v === true)} />
          {t("mineOnly")}
        </label>
        <span className="ml-auto text-xs text-muted-foreground">
          {t("count", { count: sorted.length })}
          {reviewCount > 0 && <span className="ml-2 font-medium text-amber-700 dark:text-amber-300">· {t("reviewWaiting", { count: reviewCount })}</span>}
        </span>
      </div>

      {query.isLoading ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : query.isError ? (
        <div className="space-y-2 rounded-2xl border border-border p-6 text-sm">
          <p className="text-destructive">{tg("error")}</p>
          <Button size="sm" variant="outline" onClick={() => void query.refetch()}>
            {tg("retry")}
          </Button>
        </div>
      ) : (
        <>
          <DesktopTable>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[96px]">{t("col.date")}</TableHead>
                  <TableHead className="w-[140px]">{t("col.subject")}</TableHead>
                  <TableHead>{t("col.title")}</TableHead>
                  <TableHead className="w-[140px]">{t("col.assignee")}</TableHead>
                  <TableHead className="w-[110px]">{t("col.due")}</TableHead>
                  <TableHead className="w-[160px]">{t("col.status")}</TableHead>
                  <TableHead className="w-[220px]">{t("col.notes")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                      {t("empty")}
                    </TableCell>
                  </TableRow>
                ) : (
                  sorted.map((task) => (
                    <TableRow
                      key={task.id}
                      className={cn("cursor-pointer", task.status === "done" && "opacity-60", openTask === task.id && "bg-accent/50")}
                      onClick={() => setOpenTask(task.id)}
                    >
                      <TableCell className="text-xs tabular-nums text-muted-foreground">{formatStamp(task.createdAt).slice(0, 10)}</TableCell>
                      <TableCell className="text-sm">{task.subject ?? ""}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <span className={cn("font-medium", task.status === "done" && "line-through")}>{task.title}</span>
                          {projectId === null && <ProjectBadge name={task.projectName} color={task.projectColor} className="text-xs text-muted-foreground" />}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{task.assigneeName ?? <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className={cn("text-sm tabular-nums", late(task) && "font-medium text-destructive")}>{formatDay(task.dueDate)}</TableCell>
                      <TableCell>
                        <StatusCell task={task} editable={editable(task)} />
                      </TableCell>
                      <TableCell className="max-w-[220px]">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="truncate" title={task.description ?? ""}>
                            {task.description ?? ""}
                          </span>
                          {task.commentCount > 0 && (
                            <span className="ml-auto inline-flex shrink-0 items-center gap-0.5">
                              <MessageSquare className="size-3" />
                              {task.commentCount}
                            </span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </DesktopTable>
          <MobileCardList empty={sorted.length === 0}>
            {sorted.map((task) => (
              <button key={task.id} type="button" className="block w-full text-left" onClick={() => setOpenTask(task.id)}>
                <MobileCard className={cn(task.status === "done" && "opacity-60")}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium">{task.title}</span>
                    <TaskStatusPill status={task.status} />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <ProjectBadge name={task.projectName} color={task.projectColor} className="text-xs" />
                    {task.subject && <span>{task.subject}</span>}
                    <span>{task.assigneeName ?? "—"}</span>
                    <span className={cn(late(task) && "font-medium text-destructive")}>{formatDay(task.dueDate)}</span>
                  </div>
                </MobileCard>
              </button>
            ))}
          </MobileCardList>
        </>
      )}
    </div>
  );
}

function NewTaskButton({ onCreated }: { onCreated: (id: number) => void }) {
  const t = useTranslations("management.tasks");
  const session = useReadySession();
  const [open, setOpen] = useState(false);
  const canCreate = session.projects.some((p) => p.canCreateTasks && !p.archived);
  if (!canCreate) return null;
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus />
        {t("new")}
      </Button>
      {open && <NewTaskPanel open={open} onOpenChange={setOpen} onCreated={onCreated} />}
    </>
  );
}

/** Yönetim Görevleri (/management/tasks): KCA Panel'deki Edoras görevleri. Açık görev URL'de (?task=). */
export function ManagementTasksPage() {
  const t = useTranslations("management.tasks");
  const qc = useQueryClient();
  // Görev listesi oturum sorgusunu BEKLEMEDEN istenir (önceden oturum → görevler art arda, ~1 sn + ~1 sn). Bağ yoksa uç hata döner;
  // prefetchQuery hatayı yutar ve TasksBoard'un useKcaTasks'ı aynı anahtarı kullanır (30 sn taze, çift istek yok).
  useEffect(() => {
    void qc.prefetchQuery({ queryKey: managementKeys.tasks(), queryFn: ({ signal }) => managementApi.tasks(signal), staleTime: 30 * 1000 });
  }, [qc]);
  const [taskParam, setTaskParam] = useUrlParam("task");
  const openTask = /^\d+$/.test(taskParam) ? Number(taskParam) : null;
  const setOpenTask = (id: number | null) => setTaskParam(id ? String(id) : "");
  return (
    <ManagementGate title={t("title")} description={t("description")} actions={<NewTaskButton onCreated={(id) => setOpenTask(id)} />}>
      <TasksBoard openTask={openTask} setOpenTask={setOpenTask} />
      <TaskDetailPanel taskId={openTask} onClose={() => setOpenTask(null)} />
    </ManagementGate>
  );
}
