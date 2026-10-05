"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCrmDate } from "@/lib/domain/crm/utils";
import { TICKET_STATUSES, type TicketDto, type TicketStatus } from "@/lib/domain/tickets/types";
import { cn } from "@/lib/utils";
import { useTickets } from "../queries";
import { CreateTicketDialog } from "./CreateTicketDialog";
import { TicketDetailDialog } from "./TicketDetailDialog";

const STATUS_TONE: Record<TicketStatus, string> = {
  OPEN: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  PENDING: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  RESOLVED: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
};

export function TicketStatusPill({ status }: { status: TicketStatus }) {
  const t = useTranslations("tickets.status");
  return <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", STATUS_TONE[status])}>{t(status)}</span>;
}

/** Destek talepleri (/crm/tickets) — her CRM kullanıcısı. Durum süzgeci, talep aç, ayrıntı ve ekip notları. */
export function TicketsPage() {
  const t = useTranslations("tickets");
  const [status, setStatus] = useState<TicketStatus | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const query = useTickets({ status: status ?? undefined });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("page.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("page.description")}</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus />
          {t("page.new")}
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5" role="group">
        {[null, ...TICKET_STATUSES].map((s) => (
          <Button key={s ?? "all"} size="sm" variant={status === s ? "secondary" : "outline"} aria-pressed={status === s} onClick={() => setStatus(s)}>
            {s ? t(`status.${s}`) : t("page.all")}
          </Button>
        ))}
      </div>

      {query.isLoading ? (
        <Skeleton className="h-48 w-full rounded-2xl" />
      ) : query.isError ? (
        <div className="space-y-2 rounded-2xl border border-border p-6 text-sm">
          <p className="text-destructive">{t("page.error")}</p>
          <Button size="sm" variant="outline" onClick={() => void query.refetch()}>{t("page.retry")}</Button>
        </div>
      ) : (query.data ?? []).length === 0 ? (
        <p className="rounded-2xl border border-border p-6 text-sm text-muted-foreground">{t("page.empty")}</p>
      ) : (
        <TicketTable tickets={query.data ?? []} onOpen={setOpenId} showInstitution />
      )}

      <CreateTicketDialog open={creating} onOpenChange={setCreating} onCreated={setOpenId} />
      <TicketDetailDialog ticketId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

/** Talep tablosu (liste sayfası ve kurum kartı ortak). */
export function TicketTable({ tickets, onOpen, showInstitution }: { tickets: TicketDto[]; onOpen: (id: string) => void; showInstitution?: boolean }) {
  const t = useTranslations("tickets");
  return (
    <div className="overflow-x-auto rounded-2xl border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">{t("page.colNumber")}</th>
            <th className="px-3 py-2 font-medium">{t("page.colSubject")}</th>
            {showInstitution && <th className="px-3 py-2 font-medium">{t("page.colInstitution")}</th>}
            <th className="px-3 py-2 font-medium">{t("page.colStatus")}</th>
            <th className="px-3 py-2 font-medium">{t("page.colPriority")}</th>
            <th className="px-3 py-2 font-medium">{t("page.colAssignee")}</th>
            <th className="px-3 py-2 font-medium">{t("page.colUpdated")}</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((k) => (
            <tr key={k.id} className="cursor-pointer border-t border-border hover:bg-muted/30" onClick={() => onOpen(k.id)}>
              <td className="px-3 py-2 tabular-nums">#{k.number}</td>
              <td className="px-3 py-2">
                <button type="button" className="text-left font-medium hover:underline" onClick={(e) => { e.stopPropagation(); onOpen(k.id); }}>
                  {k.subject}
                </button>
                {k.noteCount > 0 && <span className="ml-2 text-xs text-muted-foreground">{t("page.notes", { count: k.noteCount })}</span>}
              </td>
              {showInstitution && <td className="px-3 py-2">{k.institutionName ?? "-"}</td>}
              <td className="px-3 py-2"><TicketStatusPill status={k.status} /></td>
              <td className="px-3 py-2">{t(`priority.${k.priority}`)}</td>
              <td className="px-3 py-2">{k.assigneeName ?? <span className="text-muted-foreground">{t("page.unassigned")}</span>}</td>
              <td className="px-3 py-2 text-muted-foreground">{formatCrmDate(k.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
