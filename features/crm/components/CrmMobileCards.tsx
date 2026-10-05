"use client";

import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/checkbox";
import type { CrmLead } from "@/lib/domain/crm/types";
import { formatCrmDate, getLeadTitle } from "@/lib/domain/crm/utils";
import type { CrmTableActions } from "../types";
import { DissatisfiedBadge, ProgramBadges } from "./CrmBadges";
import { CrmRowActionsMenu } from "./CrmRowActionsMenu";
import { CustomerBadge, LinkedMark } from "./CrmRowParts";
import { LeadScoreBadge } from "./LeadScoreBadge";
import { StatusDropdown } from "./StatusDropdown";

/** Mobil kart listesi — tabloyla aynı sade içerik (satır içi statü seçici + tek "İşlemler" menüsü); karta dokunmak aday panelini açar. */
export function CrmMobileCards({
  leads,
  actions,
  selection,
}: {
  leads: CrmLead[];
  actions: CrmTableActions;
  /** Toplu işlem seçimi; verilmezse seçim kutusu çizilmez. */
  selection?: { selected: ReadonlySet<string>; toggle: (id: string) => void };
}) {
  const t = useTranslations("crm.list");
  const tBulk = useTranslations("crm.bulk");

  return (
    <div className="space-y-3 p-3 md:hidden">
      {leads.map((lead) => {
        const { title, subtitle } = getLeadTitle(lead);
        const location = [lead.city, lead.country].filter(Boolean).join(", ");
        const open = () => actions.onOpen?.(lead);

        return (
          <div
            key={lead.id}
            role={actions.onOpen ? "button" : undefined}
            tabIndex={actions.onOpen ? 0 : undefined}
            aria-label={actions.onOpen ? t("openDetail", { name: title }) : undefined}
            onClick={actions.onOpen ? open : undefined}
            onKeyDown={
              actions.onOpen
                ? (e) => {
                    if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
                      e.preventDefault();
                      open();
                    }
                  }
                : undefined
            }
            className="cursor-pointer rounded-xl border border-border bg-background/60 p-4 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                {selection && (
                  <span className="pt-0.5" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selection.selected.has(lead.id)}
                      onCheckedChange={() => selection.toggle(lead.id)}
                      aria-label={tBulk("selectRow", { name: title })}
                    />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-semibold">{title}</span>
                    <LinkedMark lead={lead} />
                    <CustomerBadge lead={lead} />
                  </div>
                  {subtitle && <p className="truncate text-sm text-muted-foreground">{subtitle}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <StatusDropdown lead={lead} onSold={actions.onStatusSold} />
                  <CrmRowActionsMenu lead={lead} actions={actions} className="-mr-1.5 -mt-0.5" />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <LeadScoreBadge lead={lead} />
                <DissatisfiedBadge value={lead.dissatisfaction} />
                {actions.renderSatisfaction?.(lead)}
                <ProgramBadges tags={lead.programTags} />
              </div>

              <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                <span>{location || "-"}</span>
                <span>{formatCrmDate(lead.createdAt)}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
