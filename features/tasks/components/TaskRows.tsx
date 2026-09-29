"use client";

import { useTranslations } from "next-intl";
import { Check, ClipboardCheck, MessageSquarePlus, Pencil, Snowflake, Undo2 } from "lucide-react";
import { Link } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/features/auth";
import { CrmContactMenu, StatusBadge, ToneBadge, contactTargetFor } from "@/features/crm";
import { InstitutionStatusBadge, formatPhone } from "@/features/institutions";
import { ProspectContactActions } from "@/features/cold-lists";
import { formatCrmDate, formatCurrency, getLeadTitle, getRemainingAmount } from "@/lib/domain/crm/utils";
import type { CrmTask } from "@/lib/domain/tasks/view";
import type { TaskProspectDto } from "@/lib/domain/tasks/types";
import { coldListHref } from "./ColdOutcomeDialog";
import { useTaskKindLabel } from "./labels";

/** Kurala özgü bağlam satırı. Bakiye tutarı yalnız finans yetkisiyle (CRM_AGENT "Açık bakiye var" görür). */
function useTaskRef(task: CrmTask): string | null {
  const t = useTranslations("crm.tasks");
  const { canSeeFinancials } = usePermissions();
  // Atanan görev: bağlam satırı atayanın notu.
  if (task.kind === "assigned") return task.note || null;
  const date = task.refDate ? formatCrmDate(task.refDate) : null;
  switch (task.kind) {
    case "scheduled":
      return null;
    case "balance": {
      const remaining = task.lead ? getRemainingAmount(task.lead.saleAmount, task.lead.collectedAmount) : 0;
      return canSeeFinancials && remaining > 0 ? t("ref.balance", { amount: formatCurrency(remaining) }) : t("ref.balanceHidden");
    }
    case "expired":
      return date ? t(task.institution?.crm?.status === "DEMO" ? "ref.expiredDemo" : "ref.expiredLicense", { date }) : null;
    case "coldList": {
      // Soğuk liste: liste adı; ulaşılamayan kişide son deneme günü.
      const list = task.prospect?.listName ?? t("cold.unknownList");
      return date ? t("ref.coldListRetry", { date, list }) : t("ref.coldList", { list });
    }
    default:
      return date ? t(`ref.${task.kind}`, { date }) : null;
  }
}

function useTaskLabels(task: CrmTask) {
  const t = useTranslations("crm.tasks");
  const kindLabel = useTaskKindLabel();
  const d = task.dueInDays;
  const due = d < 0 ? t("due.overdue", { days: -d }) : d === 0 ? t("due.today") : t("due.inDays", { days: d });
  const ref = useTaskRef(task);
  return { kind: kindLabel(task), due, ref, tone: (d < 0 ? "red" : d === 0 ? "orange" : "gray") as "red" | "orange" | "gray" };
}

const prospectName = (p: TaskProspectDto) => [p.firstName, p.lastName].filter(Boolean).join(" ");

/** Soğuk liste kişisi (CRM'de değil): kurum / ad, telefon. */
function ProspectCustomer({ p }: { p: TaskProspectDto }) {
  const name = prospectName(p);
  return (
    <div className="flex flex-col">
      <span className="font-medium">{p.organization || name || p.phoneRaw || p.email || "—"}</span>
      {p.organization && name && <span className="text-xs text-muted-foreground">{name}</span>}
      {(p.phone || p.phoneRaw) && <span className="text-xs text-muted-foreground">{p.phone ? formatPhone(p.phone) : p.phoneRaw}</span>}
    </div>
  );
}

/** Müşteri: aday (Adaylar'da detayı açar), adayı olmayan kurum (kurum sayfası) ya da soğuk liste kişisi. */
function Customer({ task }: { task: CrmTask }) {
  const t = useTranslations("crm.tasks");
  if (task.prospect) return <ProspectCustomer p={task.prospect} />;
  if (task.lead) {
    const { title, subtitle } = getLeadTitle(task.lead);
    return (
      <div className="flex flex-col">
        <Link href={`/crm?lead=${encodeURIComponent(task.lead.id)}`} className="font-medium hover:underline">
          {title}
        </Link>
        {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
        {task.lead.contactPhone && <span className="text-xs text-muted-foreground">{formatPhone(task.lead.contactPhone)}</span>}
      </div>
    );
  }
  const inst = task.institution;
  if (!inst) return null;
  return (
    <div className="flex flex-col">
      <Link href={`/institutions/${encodeURIComponent(inst.id)}`} className="font-medium hover:underline">
        {inst.name}
      </Link>
      {inst.crm?.contactName && <span className="text-xs text-muted-foreground">{inst.crm.contactName}</span>}
      {inst.crm?.contactPhone && <span className="text-xs text-muted-foreground">{formatPhone(inst.crm.contactPhone)}</span>}
      <span className="text-xs italic text-muted-foreground">{t("noLead")}</span>
    </div>
  );
}

/** Durum: adayın CRM statüsü; adayı olmayan kurum görevinde kurumun durumu (demo / lisans); soğuk listede arama sonucu. */
function TaskStatus({ task, today }: { task: CrmTask; today: string }) {
  const tOutcome = useTranslations("growth.coldLists.outcomes");
  if (task.prospect) {
    return (
      <ToneBadge tone={task.prospect.outcome === "UNREACHABLE" ? "yellow" : "gray"} className="gap-1">
        <Snowflake className="h-3 w-3" aria-hidden />
        {tOutcome(task.prospect.outcome)}
      </ToneBadge>
    );
  }
  if (task.lead) return <StatusBadge status={task.lead.status} />;
  return task.institution ? <InstitutionStatusBadge item={task.institution} today={today} /> : null;
}

/** "Atanan: Ad Soyad" / "Ad Soyad tamamladı · Ulaşıldı, görüşüldü". */
function PeopleLine({ task }: { task: CrmTask }) {
  const t = useTranslations("crm.tasks");
  return (
    <>
      {task.assigneeName && <span className="text-xs text-muted-foreground">{t("assign.assigneeLabel", { name: task.assigneeName })}</span>}
      {task.status === "DONE" && (task.completedByName || task.outcome) && (
        <span className="text-xs text-muted-foreground">
          {[task.completedByName && t("doneBy", { name: task.completedByName }), task.outcome && t(`dialog.outcomes.${task.outcome}`)]
            .filter(Boolean)
            .join(" · ")}
        </span>
      )}
    </>
  );
}

export interface TaskRowProps {
  task: CrmTask;
  today: string;
  /** Geri al düğmesi: tamamlayan ya da yönetici. */
  canUndo: boolean;
  undoing: boolean;
  onComplete: () => void;
  onUndo: () => void;
  onNote: () => void;
  onEdit?: () => void;
}

/** Soğuk liste kişisi: sonuç kişinin kaydına yazılır (CRM notu / düzenleme yok); CRM'e alma soğuk liste ekranında. */
function ProspectActions({ p, onComplete }: { p: TaskProspectDto; onComplete: () => void }) {
  const t = useTranslations("crm.tasks");
  return (
    <div className="flex flex-nowrap items-center gap-1">
      <Button size="sm" onClick={onComplete}>
        <ClipboardCheck />
        {t("cold.record")}
      </Button>
      <ProspectContactActions phone={p.phone} />
      <Link href={coldListHref(p.listId)} className="px-1 text-xs text-primary underline-offset-2 hover:underline">
        {t("cold.openList")}
      </Link>
    </div>
  );
}

function Actions(props: TaskRowProps) {
  if (props.task.prospect) return <ProspectActions p={props.task.prospect} onComplete={props.onComplete} />;
  return <CrmActions {...props} />;
}

function CrmActions({ task, canUndo, undoing, onComplete, onUndo, onNote, onEdit }: TaskRowProps) {
  const t = useTranslations("crm.tasks");
  const tList = useTranslations("crm.list");
  const { canSeeFinancials } = usePermissions();
  const lead = task.lead;
  const inst = task.institution;
  const target = lead
    ? contactTargetFor(lead, getLeadTitle(lead).title, canSeeFinancials)
    : {
        leadId: null,
        phone: inst?.crm?.contactPhone ?? null,
        email: inst?.crm?.contactEmail ?? null,
        name: inst?.crm?.contactName ?? inst?.name ?? null,
        organization: inst?.name ?? null,
        endDate: task.refDate ? formatCrmDate(task.refDate) : null,
      };
  return (
    <div className="flex flex-nowrap items-center gap-1">
      {task.status === "DONE" ? (
        canUndo && (
          <Button size="sm" variant="ghost" onClick={onUndo} disabled={undoing} title={t("undoHint")}>
            <Undo2 />
            {t("undo")}
          </Button>
        )
      ) : (
        <Button size="sm" onClick={onComplete}>
          <Check />
          {t("complete")}
        </Button>
      )}
      {lead && (
        <Button size="icon-sm" variant="ghost" onClick={onNote} aria-label={tList("actions.addNote")} title={tList("actions.addNote")}>
          <MessageSquarePlus />
        </Button>
      )}
      {lead && onEdit && (
        <Button size="icon-sm" variant="ghost" onClick={onEdit} aria-label={tList("actions.edit")} title={tList("actions.edit")}>
          <Pencil />
        </Button>
      )}
      <CrmContactMenu target={target} />
    </div>
  );
}

function DueCell({ task, due, tone }: { task: CrmTask; due: string; tone: "red" | "orange" | "gray" }) {
  const t = useTranslations("crm.tasks");
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-sm">{formatCrmDate(task.dueDate)}</span>
      {task.status === "DONE" ? <ToneBadge tone="green">{t("done")}</ToneBadge> : <ToneBadge tone={tone}>{due}</ToneBadge>}
    </div>
  );
}

export function TaskRow(props: TaskRowProps) {
  const { task, today } = props;
  const l = useTaskLabels(task);
  return (
    <TableRow className={cn(task.status === "DONE" && "opacity-60")}>
      <TableCell>
        <Customer task={task} />
      </TableCell>
      <TableCell>
        <div className="flex flex-col">
          <span className="text-sm font-medium">{l.kind}</span>
          {l.ref && (
            <span className="max-w-[18rem] truncate text-xs text-muted-foreground" title={task.kind === "assigned" ? l.ref : undefined}>
              {l.ref}
            </span>
          )}
          <PeopleLine task={task} />
        </div>
      </TableCell>
      <TableCell>
        <DueCell task={task} due={l.due} tone={l.tone} />
      </TableCell>
      <TableCell>
        <TaskStatus task={task} today={today} />
      </TableCell>
      <TableCell>
        <Actions {...props} />
      </TableCell>
    </TableRow>
  );
}

export function TaskCard(props: TaskRowProps) {
  const { task, today } = props;
  const l = useTaskLabels(task);
  const t = useTranslations("crm.tasks");
  return (
    <div className={cn("space-y-2 rounded-xl border border-border bg-background/60 p-4", task.status === "DONE" && "opacity-60")}>
      <div className="flex items-start justify-between gap-2">
        <Customer task={task} />
        <TaskStatus task={task} today={today} />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">{l.kind}</span>
        {task.status === "DONE" ? <ToneBadge tone="green">{t("done")}</ToneBadge> : <ToneBadge tone={l.tone}>{l.due}</ToneBadge>}
        {l.ref && <span className="break-words text-xs text-muted-foreground">{l.ref}</span>}
        <PeopleLine task={task} />
      </div>
      <Actions {...props} />
    </div>
  );
}
