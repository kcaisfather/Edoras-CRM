"use client";

import { createContext, useContext } from "react";
import { useTranslations } from "next-intl";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCrmDate } from "@/lib/domain/crm/utils";
import { parseKcaTimestamp } from "@/lib/domain/kca/rules";
import type { KcaMemberDto, KcaProjectDto, KcaSessionDto, KcaTaskStatus } from "@/lib/domain/kca/types";
import { normalizeSearch } from "@/lib/data/tr-locations";
import { cn } from "@/lib/utils";

export type ReadySession = Extract<KcaSessionDto, { state: "READY" }>;

const SessionContext = createContext<ReadySession | null>(null);
export const KcaSessionProvider = SessionContext.Provider;

/** ManagementGate içindeki ekranlar: bağlı KCA hesabı + kişinin gördüğü Edoras projeleri. */
export function useReadySession(): ReadySession {
  const s = useContext(SessionContext);
  if (!s) throw new Error("useReadySession yalnız ManagementGate içinde");
  return s;
}

export const TEXTAREA_CLASS =
  "flex min-h-[72px] w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 md:text-sm";

export const NONE = "__none__";

const DATE_TIME = new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });

/** "YYYY-MM-DD" → "14.10.2026"; boşsa "—". */
export function formatDay(value: string | null | undefined): string {
  return value ? formatCrmDate(value) : "—";
}

/** KCA Panel UTC zaman damgası → İstanbul saatiyle "14.10.2026 11:30". */
export function formatStamp(value: string | null | undefined): string {
  const d = parseKcaTimestamp(value);
  return d ? DATE_TIME.format(d) : "—";
}

/** Türkçe duyarlı serbest metin araması (ı/i, büyük/küçük, aksan farkı yok). */
export function matchesQuery(query: string, ...fields: (string | null | undefined)[]): boolean {
  const q = normalizeSearch(query.trim());
  if (!q) return true;
  return normalizeSearch(fields.filter(Boolean).join(" ")).includes(q);
}

/** KCA Panel proje rengi (#rrggbb); başka bir değer gelirse varsayılan mavi. */
export const safeColor = (color: string) => (/^#[0-9a-f]{6}$/i.test(color) ? color : "#3b6fd8");

export function ProjectBadge({ name, color, className }: { name: string; color: string; className?: string }) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5 text-sm", className)}>
      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: safeColor(color) }} aria-hidden />
      <span className="truncate">{name}</span>
    </span>
  );
}

const STATUS_TONE: Record<KcaTaskStatus, string> = {
  todo: "bg-muted text-muted-foreground",
  doing: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  blocked: "bg-red-500/15 text-red-700 dark:text-red-300",
  review: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  done: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
};

export function TaskStatusPill({ status }: { status: KcaTaskStatus }) {
  const t = useTranslations("management.taskStatus");
  return <span className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", STATUS_TONE[status])}>{t(status)}</span>;
}

export function Pill({ tone, children }: { tone: "muted" | "amber" | "emerald" | "sky" | "red"; children: React.ReactNode }) {
  const tones = {
    muted: "bg-muted text-muted-foreground",
    amber: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    emerald: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    sky: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
    red: "bg-red-500/15 text-red-700 dark:text-red-300",
  } as const;
  return <span className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", tones[tone])}>{children}</span>;
}

/** Projeler ağaç sırasıyla: Edoras ana projesi önce, alt projeler girintili. */
export function orderedProjects(projects: KcaProjectDto[]): KcaProjectDto[] {
  const roots = projects.filter((p) => p.parentId === null || !projects.some((x) => x.id === p.parentId));
  const out: KcaProjectDto[] = [];
  for (const r of roots) {
    out.push(r);
    out.push(...projects.filter((p) => p.parentId === r.id).sort((a, b) => a.name.localeCompare(b.name, "tr")));
  }
  return out;
}

export function ProjectSelect({
  id,
  projects,
  value,
  onChange,
  disabled,
}: {
  id?: string;
  projects: KcaProjectDto[];
  value: number | null;
  onChange: (id: number) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("management.common");
  return (
    <Select value={value ? String(value) : undefined} onValueChange={(v) => onChange(Number(v))} disabled={disabled}>
      <SelectTrigger id={id}>
        <SelectValue placeholder={t("project")} />
      </SelectTrigger>
      <SelectContent>
        {orderedProjects(projects).map((p) => (
          <SelectItem key={p.id} value={String(p.id)}>
            <span className={cn(p.parentId !== null && "pl-3")}>
              {p.name}
              {p.archived ? ` (${t("archived")})` : ""}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Projenin aktif üyeleri (sorumlu seçenekleri). */
export function membersOf(members: KcaMemberDto[], projectId: number | null): { id: number; name: string }[] {
  return members.filter((m) => m.projectId === projectId && m.active).map((m) => ({ id: m.id, name: m.name }));
}

export function AssigneeSelect({
  id,
  members,
  value,
  onChange,
  disabled,
}: {
  id?: string;
  members: { id: number; name: string }[];
  value: number | null;
  onChange: (id: number | null) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("management.common");
  return (
    <Select value={value ? String(value) : NONE} onValueChange={(v) => onChange(v === NONE ? null : Number(v))} disabled={disabled}>
      <SelectTrigger id={id}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{t("unassigned")}</SelectItem>
        {members.map((m) => (
          <SelectItem key={m.id} value={String(m.id)}>
            {m.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Proje sekmeleri: Tüm Edoras + her proje (sayıyla). Ana proje sekmesi alt projelerini de kapsar (KCA Panel gibi). */
export function ProjectTabs({
  projects,
  counts,
  value,
  onChange,
}: {
  projects: { id: number; name: string; color: string; parentId: number | null }[];
  counts: Map<number, number>;
  value: number | null;
  onChange: (id: number | null) => void;
}) {
  const t = useTranslations("management.common");
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const countOf = (id: number) => (counts.get(id) ?? 0) + projects.filter((c) => c.parentId === id).reduce((a, c) => a + (counts.get(c.id) ?? 0), 0);
  const tab = (active: boolean) =>
    cn(
      "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-xs font-medium transition-colors",
      active ? "border-primary/40 bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
    );
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("project")}>
      <button type="button" className={tab(value === null)} aria-pressed={value === null} onClick={() => onChange(null)}>
        {t("allProjects")} <span className="text-muted-foreground">{total}</span>
      </button>
      {projects.map((p) => (
        <button key={p.id} type="button" className={tab(value === p.id)} aria-pressed={value === p.id} onClick={() => onChange(p.id)}>
          <span className="size-2 rounded-full" style={{ backgroundColor: safeColor(p.color) }} aria-hidden />
          {p.name} <span className="text-muted-foreground">{countOf(p.id)}</span>
        </button>
      ))}
    </div>
  );
}

export function Field({ label, htmlFor, hint, children, className }: { label: string; htmlFor?: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium leading-none">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
