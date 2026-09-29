"use client";

import { useTranslations } from "next-intl";
import { FlaskConical, MessageSquarePlus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/features/auth";
import type { CrmLead } from "@/lib/domain/crm/types";
import { formatCrmDate, getLeadTitle } from "@/lib/domain/crm/utils";
import type { CrmTableActions } from "../types";
import { DissatisfiedBadge, ProgramBadges, StatusBadge } from "./CrmBadges";
import { CrmContactMenu, contactTargetFor } from "./CrmContactMenu";
import { CustomerBadge, LinkedMark, SendSurveyButton, stop } from "./CrmTable";

/** Mobil kart listesi — tabloyla aynı sade içerik; karta dokunmak detay penceresini açar. */
export function CrmMobileCards({ leads, actions }: { leads: CrmLead[]; actions: CrmTableActions }) {
  const t = useTranslations("crm.list");
  const { canSeeFinancials } = usePermissions();

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
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-semibold">{title}</span>
                    <LinkedMark lead={lead} />
                    <CustomerBadge lead={lead} />
                  </div>
                  {subtitle && <p className="truncate text-sm text-muted-foreground">{subtitle}</p>}
                </div>
                <span className="shrink-0">
                  <StatusBadge status={lead.status} />
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <DissatisfiedBadge value={lead.dissatisfaction} />
                {actions.renderSatisfaction?.(lead)}
                <ProgramBadges tags={lead.programTags} />
              </div>

              <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                <span>{location || "-"}</span>
                <span>{formatCrmDate(lead.createdAt)}</span>
              </div>

              <div className="flex flex-wrap gap-1 border-t border-border pt-2" onClick={stop} onKeyDown={stop}>
                <Button variant="outline" size="sm" onClick={() => actions.onEdit(lead)}>
                  <Pencil />
                  {t("actions.edit")}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => actions.onAddNote(lead)}
                  aria-label={t("actions.addNote")}
                  title={t("actions.addNote")}
                >
                  <MessageSquarePlus />
                </Button>
                {actions.onOpenDemo && !lead.institutionId && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => actions.onOpenDemo?.(lead)}
                    aria-label={t("openDemo")}
                    title={t("openDemo")}
                  >
                    <FlaskConical />
                  </Button>
                )}
                <SendSurveyButton lead={lead} actions={actions} />
                {actions.renderAssignTask?.(lead)}
                <CrmContactMenu target={contactTargetFor(lead, title, canSeeFinancials)} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
