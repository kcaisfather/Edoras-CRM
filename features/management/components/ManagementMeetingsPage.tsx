"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { useRouter } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DesktopTable, MobileCard, MobileCardList, SearchBox } from "@/components/list";
import { useUrlParam } from "@/lib/hooks/use-url-param";
import { KCA_MEETING_STATUSES, type KcaMeetingStatus } from "@/lib/domain/kca/types";
import { cn } from "@/lib/utils";
import { useKcaMeetings } from "../queries";
import { ManagementGate } from "./ManagementGate";
import { MeetingAiPill, MeetingDetailPanel, MeetingFormPanel, useVisibilityLabel } from "./MeetingPanels";
import { MeetingMarkdown } from "./MeetingMarkdown";
import { Pill, ProjectBadge, ProjectTabs, formatDay, matchesQuery, useReadySession } from "./shared";

const ALL = "__all__";
type StatusFilter = KcaMeetingStatus | "waiting" | typeof ALL;

function MeetingsBoard({ openMeeting, setOpenMeeting }: { openMeeting: number | null; setOpenMeeting: (id: number | null) => void }) {
  const t = useTranslations("management.meetings");
  const tm = useTranslations("management.meetingStatus");
  const tg = useTranslations("management.gate");
  const session = useReadySession();
  const visibility = useVisibilityLabel();
  const query = useKcaMeetings();
  const [projectId, setProjectId] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>(ALL);
  const [view, setView] = useState<"list" | "notes">("list");
  const projectById = useMemo(() => new Map(session.projects.map((p) => [p.id, p])), [session.projects]);

  const meetings = useMemo(() => query.data ?? [], [query.data]);
  // Sekmeler: kişinin gördüğü projeler + yalnız kendi notunun bulunduğu (üyesi olmadığı) Edoras projeleri.
  const tabs = useMemo(() => {
    const out = [...session.projects];
    for (const m of meetings) {
      if (!out.some((p) => p.id === m.projectId)) out.push({ id: m.projectId, name: m.projectName, color: m.projectColor, parentId: null, archived: false, canCreateTasks: false, canEditDueDates: false });
    }
    return out;
  }, [session.projects, meetings]);

  const filtered = useMemo(
    () =>
      meetings.filter((m) => {
        if (status === "waiting" && !(m.ai && !m.processedAt)) return false;
        if (status !== "waiting" && status !== ALL && m.status !== status) return false;
        return matchesQuery(q, m.title, m.participants, m.body, m.projectName, m.result);
      }),
    [meetings, status, q]
  );
  const counts = useMemo(() => {
    const c = new Map<number, number>();
    for (const m of filtered) c.set(m.projectId, (c.get(m.projectId) ?? 0) + 1);
    return c;
  }, [filtered]);
  const rows = projectId === null ? filtered : filtered.filter((m) => m.projectId === projectId || projectById.get(m.projectId)?.parentId === projectId);
  const waiting = meetings.filter((m) => m.ai && !m.processedAt).length;

  return (
    <div className="space-y-3">
      <ProjectTabs projects={tabs} counts={counts} value={projectId} onChange={setProjectId} />
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={q} onChange={setQ} placeholder={t("searchPlaceholder")} />
        <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
          <SelectTrigger className="h-9 w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("allStatuses")}</SelectItem>
            {KCA_MEETING_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {tm(s)}
              </SelectItem>
            ))}
            <SelectItem value="waiting">{t("waiting")}</SelectItem>
          </SelectContent>
        </Select>
        <SegmentedControl
          value={view}
          onValueChange={setView}
          options={[
            { value: "list", label: t("viewList") },
            { value: "notes", label: t("viewNotes") },
          ]}
        />
        <span className="ml-auto text-xs text-muted-foreground">
          {t("count", { count: rows.length })}
          {waiting > 0 && <span className="ml-2 font-medium text-amber-700 dark:text-amber-300">· {t("waitingCount", { count: waiting })}</span>}
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
      ) : view === "notes" ? (
        rows.length === 0 ? (
          <p className="rounded-2xl border border-border p-6 text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <div className="mx-auto max-w-4xl space-y-4">
            {rows.map((m) => (
              <article key={m.id} className="space-y-3 rounded-2xl border border-border bg-card p-4">
                <header className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className="font-semibold tabular-nums">{formatDay(m.meetingDate)}</span>
                  <button type="button" className="font-semibold hover:underline" onClick={() => setOpenMeeting(m.id)}>
                    {m.title}
                  </button>
                  <ProjectBadge name={m.projectName} color={m.projectColor} className="text-xs text-muted-foreground" />
                  {m.participants && <span className="text-xs text-muted-foreground">{m.participants}</span>}
                  <span className="ml-auto">
                    <MeetingAiPill meeting={m} />
                  </span>
                </header>
                <MeetingMarkdown body={m.body} />
                {m.result && <p className="rounded-lg bg-emerald-500/10 p-2 text-xs">{m.result}</p>}
              </article>
            ))}
          </div>
        )
      ) : (
        <>
          <DesktopTable>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">{t("col.date")}</TableHead>
                  <TableHead>{t("col.title")}</TableHead>
                  <TableHead className="w-[160px]">{t("col.project")}</TableHead>
                  <TableHead className="w-[200px]">{t("col.participants")}</TableHead>
                  <TableHead className="w-[100px]">{t("col.status")}</TableHead>
                  <TableHead className="w-[70px] text-right">{t("col.tasks")}</TableHead>
                  <TableHead className="w-[110px]">{t("col.ai")}</TableHead>
                  <TableHead className="w-[150px]">{t("col.visibility")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                      {t("empty")}
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((m) => (
                    <TableRow key={m.id} className={cn("cursor-pointer", openMeeting === m.id && "bg-accent/50")} onClick={() => setOpenMeeting(m.id)}>
                      <TableCell className="text-sm tabular-nums">{formatDay(m.meetingDate)}</TableCell>
                      <TableCell className="font-medium">{m.title}</TableCell>
                      <TableCell>
                        <ProjectBadge name={m.projectName} color={m.projectColor} />
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground" title={m.participants ?? ""}>
                        {m.participants ?? ""}
                      </TableCell>
                      <TableCell>
                        <Pill tone={m.status === "planned" ? "sky" : "muted"}>{tm(m.status)}</Pill>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{m.taskCount || ""}</TableCell>
                      <TableCell>
                        <MeetingAiPill meeting={m} />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{visibility(m)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </DesktopTable>
          <MobileCardList empty={rows.length === 0}>
            {rows.map((m) => (
              <button key={m.id} type="button" className="block w-full text-left" onClick={() => setOpenMeeting(m.id)}>
                <MobileCard>
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium">{m.title}</span>
                    <MeetingAiPill meeting={m} />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="tabular-nums">{formatDay(m.meetingDate)}</span>
                    <ProjectBadge name={m.projectName} color={m.projectColor} className="text-xs" />
                    {m.participants && <span>{m.participants}</span>}
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

function NewMeetingButton({ onCreated }: { onCreated: (id: number) => void }) {
  const t = useTranslations("management.meetings");
  const session = useReadySession();
  const [open, setOpen] = useState(false);
  if (!session.projects.some((p) => !p.archived)) return null;
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus />
        {t("new")}
      </Button>
      {open && <MeetingFormPanel open={open} onOpenChange={setOpen} onSaved={onCreated} />}
    </>
  );
}

/** Toplantı Notları (/management/meetings): Edoras toplantıları; açık not URL'de (?meeting=). */
export function ManagementMeetingsPage() {
  const t = useTranslations("management.meetings");
  const router = useRouter();
  const [meetingParam, setMeetingParam] = useUrlParam("meeting");
  const openMeeting = /^\d+$/.test(meetingParam) ? Number(meetingParam) : null;
  const setOpenMeeting = (id: number | null) => setMeetingParam(id ? String(id) : "");
  return (
    <ManagementGate title={t("title")} description={t("description")} actions={<NewMeetingButton onCreated={(id) => setOpenMeeting(id)} />}>
      <MeetingsBoard openMeeting={openMeeting} setOpenMeeting={setOpenMeeting} />
      <MeetingDetailPanel meetingId={openMeeting} onClose={() => setOpenMeeting(null)} onOpenTask={(id) => router.push(`/management/tasks?task=${id}`)} />
    </ManagementGate>
  );
}
