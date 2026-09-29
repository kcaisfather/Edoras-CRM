"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, CircleAlert, Plus } from "lucide-react";
import { useRouter } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CsvButton, DesktopTable, EmptyRow, ListState, MobileCard, MobileCardList, SearchBox } from "@/components/list";
import { useUrlParam } from "@/lib/hooks/use-url-param";
import { cn } from "@/lib/utils";
import { todayIso } from "@/lib/domain/institutions/rules";
import { searchInstitutions } from "@/lib/domain/institutions/search";
import {
  INSTITUTION_FILTERS,
  institutionStatus,
  matchesFilter,
  statusPriority,
  type InstitutionFilter,
  type InstitutionStatusInfo,
} from "@/lib/domain/institutions/status";
import type { InstitutionListItem } from "@/lib/domain/institutions/types";
import { useInstitutions } from "../queries";
import { formatDate, formatPhone, programLabel } from "../format";
import { InstitutionStatusBadge, useStatusLabel } from "./InstitutionStatusBadge";
import { NewDemoDialog } from "./NewDemoDialog";

const th = "text-xs font-semibold uppercase tracking-wider text-muted-foreground";
const clickableRow =
  "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60";

interface Row {
  item: InstitutionListItem;
  info: InstitutionStatusInfo;
  /** Demo kurumda demo bitişi, diğerlerinde lisans bitişi. */
  endsOn: string | null;
}

function toRows(items: InstitutionListItem[], today: string): Row[] {
  return items
    .map((item) => ({
      item,
      info: institutionStatus(item, today),
      endsOn: item.crm?.status === "DEMO" ? item.crm.demoEndsAt : item.licenseEndsOn,
    }))
    .sort(
      (a, b) =>
        statusPriority(a.info) - statusPriority(b.info) || a.item.name.localeCompare(b.item.name, "tr")
    );
}

/** Kurumlar: demo, ücretli ve CRM kaydı olmayan tüm Edoras kurumları; aksiyon bekleyenler üstte. */
export function InstitutionsPage() {
  const t = useTranslations("institutions.list");
  const tFilter = useTranslations("institutions.filters");
  const router = useRouter();
  const statusLabel = useStatusLabel();
  const query = useInstitutions();
  const [q, setQ] = useUrlParam("q");
  const [filterParam, setFilter] = useUrlParam("filter", "all");
  const [newParam, setNewParam] = useUrlParam("new");
  const filter: InstitutionFilter = (INSTITUTION_FILTERS as readonly string[]).includes(filterParam)
    ? (filterParam as InstitutionFilter)
    : "all";

  const today = todayIso();
  const all = useMemo(() => toRows(query.data ?? [], today), [query.data, today]);
  const counts = useMemo(() => {
    const out = {} as Record<InstitutionFilter, number>;
    for (const f of INSTITUTION_FILTERS) out[f] = all.filter((r) => matchesFilter(r.info, f)).length;
    return out;
  }, [all]);
  const rows = useMemo(() => {
    const byFilter = all.filter((r) => matchesFilter(r.info, filter));
    const found = new Set(searchInstitutions(byFilter.map((r) => r.item), q));
    return byFilter.filter((r) => found.has(r.item));
  }, [all, filter, q]);

  const open = (id: string) => router.push(`/institutions/${id}`);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <Button onClick={() => setNewParam("demo")}>
          <Plus />
          {t("newDemo")}
        </Button>
      </div>

      <div role="group" aria-label={t("filtersLabel")} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {INSTITUTION_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
              filter === f
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-border bg-card/60 text-muted-foreground hover:text-foreground"
            )}
          >
            {tFilter(f)}
            <span className="tabular-nums opacity-80">{counts[f] ?? 0}</span>
          </button>
        ))}
      </div>

      <ListState isLoading={query.isLoading} isError={query.isError} onRetry={() => query.refetch()}>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SearchBox value={q} onChange={setQ} />
            <CsvButton
              filename="kurumlar"
              header={[t("csv.name"), t("csv.program"), t("csv.status"), t("csv.contact"), t("csv.phone"), t("csv.email"), t("csv.endsOn"), t("csv.billing")]}
              rows={() =>
                rows.map((r) => [
                  r.item.name,
                  programLabel(r.item.program),
                  statusLabel(r.info),
                  r.item.crm?.contactName,
                  r.item.crm ? formatPhone(r.item.crm.contactPhone) : null,
                  r.item.crm?.contactEmail,
                  r.endsOn,
                  r.item.crm ? (r.item.crm.billingComplete ? t("billingOk") : t("billingMissing")) : null,
                ])
              }
            />
          </div>

          <DesktopTable>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className={th}>{t("cols.name")}</TableHead>
                  <TableHead className={th}>{t("cols.status")}</TableHead>
                  <TableHead className={th}>{t("cols.contact")}</TableHead>
                  <TableHead className={th}>{t("cols.endsOn")}</TableHead>
                  <TableHead className={th}>{t("cols.billing")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? <EmptyRow colSpan={5} /> : null}
                {rows.map((r) => (
                  <TableRow
                    key={r.item.id}
                    className={clickableRow}
                    tabIndex={0}
                    role="link"
                    onClick={() => open(r.item.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        open(r.item.id);
                      }
                    }}
                  >
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-2">
                        {r.item.name}
                        {r.item.program ? (
                          <span className="rounded border border-border px-1.5 text-[10px] font-semibold text-muted-foreground">
                            {programLabel(r.item.program)}
                          </span>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell>
                      <InstitutionStatusBadge item={r.item} today={today} />
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.item.crm ? (
                        <span className="block leading-tight">
                          {r.item.crm.contactName}
                          <span className="block text-xs text-muted-foreground">{formatPhone(r.item.crm.contactPhone)}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">{formatDate(r.endsOn)}</TableCell>
                    <TableCell>
                      <BillingMark item={r.item} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DesktopTable>

          <MobileCardList empty={rows.length === 0}>
            {rows.map((r) => (
              <MobileCard key={r.item.id} className={clickableRow}>
                <button type="button" onClick={() => open(r.item.id)} className="w-full space-y-2 text-left">
                  <span className="flex items-start justify-between gap-2">
                    <span className="font-semibold">{r.item.name}</span>
                    <InstitutionStatusBadge item={r.item} today={today} />
                  </span>
                  {r.item.crm ? (
                    <span className="block text-sm text-muted-foreground">
                      {r.item.crm.contactName} · {formatPhone(r.item.crm.contactPhone)}
                    </span>
                  ) : null}
                  <span className="block text-xs text-muted-foreground">
                    {t("cols.endsOn")}: {formatDate(r.endsOn)}
                  </span>
                </button>
              </MobileCard>
            ))}
          </MobileCardList>
        </div>
      </ListState>

      <NewDemoDialog open={newParam === "demo"} onOpenChange={(next) => !next && setNewParam("")} />
    </div>
  );
}

function BillingMark({ item }: { item: InstitutionListItem }) {
  const t = useTranslations("institutions.list");
  if (!item.crm) return <span className="text-muted-foreground">—</span>;
  return item.crm.billingComplete ? (
    <span className="inline-flex items-center gap-1 text-xs text-success">
      <CheckCircle2 className="h-3.5 w-3.5" />
      {t("billingOk")}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <CircleAlert className="h-3.5 w-3.5" />
      {t("billingMissing")}
    </span>
  );
}
