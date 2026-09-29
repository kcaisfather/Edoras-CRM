"use client";

import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { CsvButton, SearchBox } from "@/components/list";
import { usePermissions } from "@/features/auth";
import { formatCrmDate } from "@/lib/domain/crm/utils";
import { csvDate } from "@/lib/utils/csv";
import { listSlug } from "@/lib/domain/cold-lists/utils";
import { OUTCOME_FILTERS, type ColdListView, type OutcomeFilter } from "../hooks";
import { ImportButton, ImportTemplateButton } from "./import/ImportDialog";

/** Üst satır: liste seçici + bilgi; içe aktar, şablon, CSV, listeyi sil (yalnız yönetici). */
export function ColdListToolbar({ view, onDeleteList }: { view: ColdListView; onDeleteList: () => void }) {
  const t = useTranslations("growth.coldLists");
  const { isAdmin } = usePermissions();
  const { list, lists, listId } = view;
  return (
    <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="cold-list-select" className="text-sm text-muted-foreground">
          {t("list")}
        </label>
        <select
          id="cold-list-select"
          value={listId}
          onChange={(e) => view.selectList(e.target.value)}
          className="h-9 max-w-[16rem] rounded-lg border border-input bg-background px-2 text-sm"
        >
          {[...lists].reverse().map((l) => (
            <option key={l.id} value={l.id}>
              {l.name} ({l.prospectCount})
            </option>
          ))}
        </select>
        {list && (
          <span className="text-xs text-muted-foreground">
            {t("created", { date: formatCrmDate(list.createdAt) })}
            {list.createdByName ? ` · ${t("createdBy", { name: list.createdByName })}` : ""}
            {list.sourceFile ? ` · ${list.sourceFile}` : ""}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ImportButton targets={["coldList"]} defaultListId={listId} onCompleted={(s) => s.listId && view.selectList(s.listId)} />
        <ImportTemplateButton />
        <CsvButton
          filename={`soguk-liste-${listSlug(list?.name ?? "liste")}`}
          header={[
            t("csv.firstName"),
            t("csv.lastName"),
            t("csv.organization"),
            t("csv.phone"),
            t("csv.email"),
            t("csv.city"),
            t("csv.district"),
            t("csv.branch"),
            t("csv.note"),
            t("csv.outcome"),
            t("csv.outcomeAt"),
            t("csv.movedAt"),
          ]}
          rows={() =>
            view.filtered.map((p) => [
              p.firstName,
              p.lastName,
              p.organization,
              p.phone ?? p.phoneRaw,
              p.email ?? p.emailRaw,
              p.city,
              p.district,
              p.branch,
              p.note,
              t(`outcomes.${p.outcome}`),
              csvDate(p.outcomeAt),
              csvDate(p.movedAt),
            ])
          }
        />
        {list && isAdmin && (
          <Button size="sm" variant="ghost" className="text-destructive" onClick={onDeleteList}>
            <Trash2 />
            {t("deleteList")}
          </Button>
        )}
      </div>
    </div>
  );
}

/** Sonuç süzgeci (sayılarla) + arama. */
export function ColdListFilters({ view }: { view: ColdListView }) {
  const t = useTranslations("growth.coldLists");
  return (
    <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-1.5">
        <div className="overflow-x-auto">
          <SegmentedControl<OutcomeFilter>
            value={view.outcome}
            onValueChange={view.setOutcome}
            aria-label={t("outcomeFilter")}
            options={OUTCOME_FILTERS.map((f) => ({ value: f, label: `${t(`filters.${f}`)} (${view.counts[f]})` }))}
          />
        </div>
        <InfoTip label={t("outcomeFilter")} align="end">
          {t("queueNote")}
        </InfoTip>
      </div>
      <SearchBox value={view.q} onChange={view.setQ} />
    </div>
  );
}
