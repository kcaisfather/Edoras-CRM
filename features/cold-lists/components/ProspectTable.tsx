"use client";

import { useTranslations } from "next-intl";
import { Flame, Trash2 } from "lucide-react";
import { Link } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { VisionListPagination } from "@/components/ui/vision-list-pagination";
import { DesktopTable, EmptyRow, MobileCard, MobileCardList } from "@/components/list";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/features/crm";
import { formatPhone } from "@/features/institutions";
import { isCrmStatus } from "@/lib/domain/crm/types";
import { formatCrmDate } from "@/lib/domain/crm/utils";
import type { ExistingContact } from "@/lib/import/duplicates";
import { PROSPECT_OUTCOMES, type Prospect, type ProspectOutcome } from "@/lib/domain/cold-lists/types";
import { canMove, isMoved, prospectName, prospectTitle } from "@/lib/domain/cold-lists/utils";
import { PAGE_SIZE, type ColdListView } from "../hooks";
import { ProspectContactActions } from "./ProspectContactActions";

const OUTCOME_TONE: Record<ProspectOutcome, string> = {
  NOT_CALLED: "border-border bg-muted text-muted-foreground",
  UNREACHABLE: "border-warning/25 bg-warning/10 text-warning",
  NOT_INTERESTED: "border-destructive/25 bg-destructive/10 text-destructive",
  TALKED: "border-success/25 bg-success/10 text-success",
};

export interface ProspectRowActions {
  onMove: (p: Prospect) => void;
  onDelete: (p: Prospect) => void;
}

function OutcomeSelect({
  value,
  dirty,
  disabled,
  onChange,
}: {
  value: ProspectOutcome;
  dirty: boolean;
  disabled: boolean;
  onChange: (o: ProspectOutcome) => void;
}) {
  const t = useTranslations("growth.coldLists");
  return (
    <select
      aria-label={t("table.outcome")}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as ProspectOutcome)}
      className={cn("h-8 rounded-full border px-2 text-xs font-medium disabled:opacity-60", OUTCOME_TONE[value], dirty && "ring-2 ring-primary/40")}
    >
      {PROSPECT_OUTCOMES.map((o) => (
        <option key={o} value={o}>
          {t(`outcomes.${o}`)}
        </option>
      ))}
    </select>
  );
}


/** CRM sütunu: taşındıysa aday bağlantısı; değilse aynı telefon / e-postayla CRM'de adayı ya da kurum kaydı var mı. */
function CrmCell({ p, matches }: { p: Prospect; matches: ExistingContact[] }) {
  const t = useTranslations("growth.coldLists");
  const date = p.movedAt ? formatCrmDate(p.movedAt) : "";
  if (p.crmLeadId)
    return (
      <Link href={`/crm?lead=${encodeURIComponent(p.crmLeadId)}`} className="text-xs text-primary underline-offset-2 hover:underline">
        {t("movedAt", { date })}
      </Link>
    );
  if (isMoved(p)) return <span className="text-xs text-muted-foreground">{t("movedLeadDeleted", { date })}</span>;
  const m = matches[0];
  if (!m) return <span className="text-xs text-muted-foreground">—</span>;
  if (m.source === "institution") return <span className="text-xs">{t("inInstitution")}</span>;
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      {t("inCrm")}
      {m.context && isCrmStatus(m.context) && <StatusBadge status={m.context} />}
    </span>
  );
}

/** Dar sütun: uzun kurum adı / not taşmasın, sağdaki "Sıcağa taşı" görünür kalsın (tam metin title'da). */
function PersonCell({ p }: { p: Prospect }) {
  const name = prospectName(p);
  const title = p.organization || prospectTitle(p);
  return (
    <div className="flex w-64 flex-col">
      <span className="truncate font-medium" title={title}>
        {title}
      </span>
      {p.organization && name && (
        <span className="truncate text-xs text-muted-foreground" title={name}>
          {name}
        </span>
      )}
      {p.branch && (
        <span className="truncate text-xs text-muted-foreground" title={p.branch}>
          {p.branch}
        </span>
      )}
      {p.note && (
        <span className="truncate text-xs text-muted-foreground" title={p.note}>
          {p.note}
        </span>
      )}
    </div>
  );
}

const phoneText = (p: Prospect) => (p.phone ? formatPhone(p.phone) : p.phoneRaw || "—");

function Row({ p, view, actions }: { p: Prospect; view: ColdListView; actions: ProspectRowActions }) {
  const t = useTranslations("growth.coldLists");
  return (
    <TableRow className={cn(isMoved(p) && "opacity-60")}>
      <TableCell>
        <PersonCell p={p} />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <div className="flex flex-col text-sm">
            <span className={cn("tabular-nums", !p.phone && p.phoneRaw && "text-destructive")}>{phoneText(p)}</span>
            {(p.email || p.emailRaw) && <span className="text-xs text-muted-foreground">{p.email ?? p.emailRaw}</span>}
          </div>
          <ProspectContactActions phone={p.phone} />
        </div>
      </TableCell>
      <TableCell className="text-sm">{[p.city, p.district].filter(Boolean).join(" / ") || "—"}</TableCell>
      <TableCell>
        <OutcomeSelect
          value={view.outcomeOf(p)}
          dirty={!!view.pending[p.id]}
          disabled={isMoved(p)}
          onChange={(o) => view.setOutcomeFor(p, o)}
        />
      </TableCell>
      <TableCell>
        <CrmCell p={p} matches={view.crmMatchesFor(p)} />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          {canMove(p) && (
            <Button size="sm" variant="outline" onClick={() => actions.onMove(p)}>
              <Flame />
              {t("moveToCrm")}
            </Button>
          )}
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t("deleteProspect")}
            title={t("deleteProspect")}
            onClick={() => actions.onDelete(p)}
          >
            <Trash2 />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function Card({ p, view, actions }: { p: Prospect; view: ColdListView; actions: ProspectRowActions }) {
  const t = useTranslations("growth.coldLists");
  const name = prospectName(p);
  return (
    <MobileCard className={cn(isMoved(p) && "opacity-60")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">{p.organization || prospectTitle(p)}</p>
          {p.organization && name && <p className="text-xs text-muted-foreground">{name}</p>}
          <p className="text-xs tabular-nums text-muted-foreground">{phoneText(p)}</p>
        </div>
        <ProspectContactActions phone={p.phone} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <OutcomeSelect
          value={view.outcomeOf(p)}
          dirty={!!view.pending[p.id]}
          disabled={isMoved(p)}
          onChange={(o) => view.setOutcomeFor(p, o)}
        />
        {canMove(p) && (
          <Button size="sm" variant="outline" onClick={() => actions.onMove(p)}>
            <Flame />
            {t("moveToCrm")}
          </Button>
        )}
      </div>
    </MobileCard>
  );
}

/** Kişi tablosu (masaüstü) + kartlar (mobil) + sayfalama (istemcide, 50'şer). */
export function ProspectTable({ view, actions }: { view: ColdListView; actions: ProspectRowActions }) {
  const t = useTranslations("growth.coldLists");
  const { visible, page, totalPages, filtered } = view;
  return (
    <>
      <DesktopTable>
        <Table className="min-w-max [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap [&_thead_tr]:bg-muted/40">
          <TableHeader>
            <TableRow>
              <TableHead>{t("table.person")}</TableHead>
              <TableHead>{t("table.contact")}</TableHead>
              <TableHead>{t("table.location")}</TableHead>
              <TableHead>{t("table.outcome")}</TableHead>
              <TableHead>{t("table.crm")}</TableHead>
              <TableHead>{t("table.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? <EmptyRow colSpan={6} /> : visible.map((p) => <Row key={p.id} p={p} view={view} actions={actions} />)}
          </TableBody>
        </Table>
        {totalPages > 1 && (
          <VisionListPagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={view.setPage}
            from={page * PAGE_SIZE + 1}
            to={Math.min(filtered.length, (page + 1) * PAGE_SIZE)}
            total={filtered.length}
            renderShowing={(from, to, total) => t("showing", { from, to, total })}
            previousLabel={t("prev")}
            nextLabel={t("next")}
          />
        )}
      </DesktopTable>

      <MobileCardList empty={visible.length === 0}>
        {visible.map((p) => (
          <Card key={p.id} p={p} view={view} actions={actions} />
        ))}
        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => view.setPage(page - 1)}>
              {t("prev")}
            </Button>
            <span className="text-muted-foreground">
              {page + 1} / {totalPages}
            </span>
            <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => view.setPage(page + 1)}>
              {t("next")}
            </Button>
          </div>
        )}
      </MobileCardList>
    </>
  );
}
