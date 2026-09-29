"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import { Link, useRouter } from "@/lib/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { CoverageNote } from "@/components/ui/coverage-note";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCurrentUser, usePermissions } from "@/features/auth";
import { CrmEditModal, CrmErrorState, CrmNoteModal } from "@/features/crm";
import { useApiErrorMessage } from "@/lib/hooks/use-api-error-message";
import { useMounted } from "@/lib/hooks/use-mounted";
import type { CrmLead } from "@/lib/domain/crm/types";
import { bucketTasks, type TaskBuckets } from "@/lib/domain/tasks/derive";
import { taskMatches, type CrmTask } from "@/lib/domain/tasks/view";
import { useReopenTask } from "../mutations";
import { useCrmTaskList } from "../queries";
import { TaskCompleteDialog } from "./TaskCompleteDialog";
import { TaskCard, TaskRow, type TaskRowProps } from "./TaskRows";

type Bucket = keyof TaskBuckets<CrmTask>;
const BUCKETS: Bucket[] = ["overdue", "today", "upcoming"];

/**
 * Madde 11 — Görevlerim (DeepSport TasksPage): gecikmiş / bugün / yaklaşan; arama; tamamlananları göster ve
 * geri al. Görevler sunucuda kurallardan türetilir ve ekiple paylaşılır (DeepSport'taki tarayıcıya özel
 * tamamlanma, not taraması, soğuk liste kaynağı ve "en iyi arama saati" yok — bkz. README).
 */
export function TasksPage() {
  const t = useTranslations("crm.tasks");
  const tCommon = useTranslations("common");
  const searchParams = useSearchParams();
  const router = useRouter();
  const mounted = useMounted();
  const data = useCrmTaskList();
  const { canAccessPath, isAdmin } = usePermissions();
  const { data: me } = useCurrentUser();
  const reopen = useReopenTask();
  const errorMessage = useApiErrorMessage();
  const [q, setQ] = useState(() => searchParams.get("q") ?? "");
  const [showDone, setShowDone] = useState(false);
  const [completeTask, setCompleteTask] = useState<CrmTask | null>(null);
  const [noteLead, setNoteLead] = useState<CrmLead | null>(null);
  const [editLead, setEditLead] = useState<CrmLead | null>(null);

  const buckets = useMemo(() => bucketTasks(data.tasks), [data.tasks]);
  const openCount = (b: Bucket) => buckets[b].filter((task) => task.status === "OPEN").length;

  const bucketParam = searchParams.get("b") as Bucket | null;
  const defaultBucket: Bucket = openCount("overdue") > 0 && openCount("today") === 0 ? "overdue" : "today";
  const bucket: Bucket = bucketParam && BUCKETS.includes(bucketParam) ? bucketParam : defaultBucket;
  const setBucket = (b: Bucket) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("b", b);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  const inBucket = buckets[bucket].filter((task) => taskMatches(task, q));
  const doneInBucket = inBucket.filter((task) => task.status === "DONE");
  const visible = showDone ? inBucket : inBucket.filter((task) => task.status === "OPEN");
  // Açıklar önce; vade sırası (gecikmişte en eski önce).
  const rows = [...visible].sort(
    (a, b) => Number(a.status === "DONE") - Number(b.status === "DONE") || a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id)
  );

  const undo = (task: CrmTask) => {
    if (!task.taskId || reopen.isPending) return;
    reopen.mutate(task.taskId, {
      onSuccess: () => toast.success(t("undone")),
      onError: (err) => toast.error(errorMessage(err, t("undoError"))),
    });
  };
  const rowProps = (task: CrmTask): TaskRowProps => ({
    task,
    today: data.today,
    canUndo: !!task.taskId && (isAdmin || (!!me?.id && task.completedBy === me.id)),
    undoing: reopen.isPending,
    onComplete: () => setCompleteTask(task),
    onUndo: () => undo(task),
    onNote: () => task.lead && setNoteLead(task.lead),
    onEdit: () => task.lead && setEditLead(task.lead),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/crm" className={buttonVariants({ size: "sm", variant: "ghost" })}>
            <ArrowLeft />
            {t("crmLink")}
          </Link>
          {canAccessPath("/crm/rules") && (
            <Link href="/crm/rules" className={buttonVariants({ size: "sm", variant: "outline" })}>
              <SlidersHorizontal />
              {t("rulesLink")}
            </Link>
          )}
        </div>
      </div>

      {!mounted || data.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-9 w-80 rounded-lg" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      ) : data.isError ? (
        <CrmErrorState onRetry={data.refetch} />
      ) : (
        <>
          {/* Kurum listesi okunamadıysa adayı olmayan kurum görevleri sessizce kaybolmasın: üstte uyarı. */}
          {data.institutionsError ? (
            <Alert className="border-warning/50 bg-warning/5 text-warning [&>svg]:text-warning">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="flex items-center justify-between gap-3">
                <span>{t("institutionsLoadError")}</span>
                <Button variant="outline" size="sm" onClick={data.refetchInstitutions}>
                  <RotateCcw />
                  {tCommon("retry")}
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}
          <CoverageNote>{t("sharedNote")}</CoverageNote>
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <SegmentedControl
              value={bucket}
              onValueChange={setBucket}
              aria-label={t("counts", { overdue: openCount("overdue"), today: openCount("today"), upcoming: openCount("upcoming") })}
              className="max-w-full overflow-x-auto"
              options={BUCKETS.map((b) => ({ value: b, label: `${t(`buckets.${b}`)} (${openCount(b)})` }))}
            />
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} aria-label={t("search")} className="h-9 pl-9" />
              </div>
              {doneInBucket.length > 0 && (
                <Button size="sm" variant="ghost" onClick={() => setShowDone((v) => !v)}>
                  {showDone ? t("hideDone") : t("showDone", { count: doneInBucket.length })}
                </Button>
              )}
            </div>
          </div>

          {rows.length === 0 ? (
            <p className="rounded-2xl border border-border/60 bg-card/60 px-4 py-10 text-center text-sm text-muted-foreground">
              {bucket === "today" && openCount("today") === 0 ? t("allClear") : t("empty")}
            </p>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/60">
              <div className="hidden w-full overflow-x-auto md:block">
                <Table className="min-w-max [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap [&_thead_tr]:bg-muted/40">
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("table.customer")}</TableHead>
                      <TableHead>{t("table.task")}</TableHead>
                      <TableHead>{t("table.due")}</TableHead>
                      <TableHead>{t("table.status")}</TableHead>
                      <TableHead>{t("table.actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((task) => (
                      <TaskRow key={task.id} {...rowProps(task)} />
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="space-y-3 p-3 md:hidden">
                {rows.map((task) => (
                  <TaskCard key={task.id} {...rowProps(task)} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <TaskCompleteDialog task={completeTask} open={!!completeTask} onOpenChange={(open) => !open && setCompleteTask(null)} />
      <CrmNoteModal open={!!noteLead} onOpenChange={(open) => !open && setNoteLead(null)} lead={noteLead} />
      <CrmEditModal open={!!editLead} onOpenChange={(open) => !open && setEditLead(null)} lead={editLead} />
    </div>
  );
}
