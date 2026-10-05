"use client";

import { useTranslations } from "next-intl";
import {
  ClipboardList,
  FileText,
  FlaskConical,
  HandCoins,
  Link2,
  ListPlus,
  MessageSquareHeart,
  MessageSquarePlus,
  MessageSquareWarning,
  Pencil,
  Phone,
  PhoneCall,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePermissions } from "@/features/auth";
import { cn } from "@/lib/utils";
import type { CrmLead } from "@/lib/domain/crm/types";
import { getLeadTitle } from "@/lib/domain/crm/utils";
import type { CrmTableActions } from "../types";
import { CrmContactMenuItems, contactTargetFor } from "./CrmContactMenu";
import { canIssueInvoice, canSendSurvey, stop } from "./CrmRowParts";

/**
 * Satır / kart tek "İşlemler" menüsü (DeepSport CrmRowActionsMenu): Düzenle (aday panelini açar), Not ekle, Görev ata,
 * Arama listesine ekle, Tahsilat ekle (satışı olan, yalnız finans yetkisi), Fatura kes (ücretli kurum, yalnız finans),
 * Anket gönder, İletişim (alt menü: Ara / E-posta / WhatsApp — "iletişim denemesi" notuyla), Demo aç / Kuruma bağla
 * (kuruma bağlı değilse), Şikâyet kaydı. Öğeler ekranı kuran bileşenin verdiği eylemleri çağırır (CrmTableActions);
 * verilmeyen eylem çizilmez.
 */
export function CrmRowActionsMenu({ lead, actions, className }: { lead: CrmLead; actions: CrmTableActions; className?: string }) {
  const t = useTranslations("crm.list");
  const tMenu = useTranslations("crm.list.rowMenu");
  const tContact = useTranslations("crm.contact");
  const { canSeeFinancials } = usePermissions();
  const title = getLeadTitle(lead).title;
  const label = t("table.actions");

  return (
    <span className={cn("inline-flex", className)} onClick={stop} onKeyDown={stop}>
      {/* modal={false}: menüden açılan pencere kapanınca sayfa etkileşimsiz kalmasın. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`${label}: ${title}`} title={label}>
            <ListPlus />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={() => actions.onEdit(lead)}>
            <Pencil />
            {t("actions.edit")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => actions.onAddNote(lead)}>
            <MessageSquarePlus />
            {t("actions.addNote")}
          </DropdownMenuItem>
          {actions.onAssignTask && (
            <DropdownMenuItem onSelect={() => actions.onAssignTask?.(lead)}>
              <ClipboardList />
              {tMenu("assignTask")}
            </DropdownMenuItem>
          )}
          {actions.onAddToCallList && (
            <DropdownMenuItem onSelect={() => actions.onAddToCallList?.(lead)}>
              <PhoneCall />
              {tMenu("addToCallList")}
            </DropdownMenuItem>
          )}
          {actions.onAddCollection && canSeeFinancials && !!lead.saleAmount && (
            <DropdownMenuItem onSelect={() => actions.onAddCollection?.(lead)}>
              <HandCoins />
              {t("addCollection")}
            </DropdownMenuItem>
          )}
          {canIssueInvoice(lead, actions, canSeeFinancials) && (
            <DropdownMenuItem onSelect={() => actions.onIssueInvoice?.(lead)}>
              <FileText />
              {t("issueInvoice")}
            </DropdownMenuItem>
          )}
          {canSendSurvey(lead, actions) && (
            <DropdownMenuItem onSelect={() => actions.onSendSurvey?.(lead)}>
              <MessageSquareHeart />
              {t("sendSurvey")}
            </DropdownMenuItem>
          )}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Phone className="size-4 text-muted-foreground" />
              {tContact("label")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-64">
              <CrmContactMenuItems target={contactTargetFor(lead, title, canSeeFinancials)} />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          {!lead.institutionId && actions.onOpenDemo && (
            <DropdownMenuItem onSelect={() => actions.onOpenDemo?.(lead)}>
              <FlaskConical />
              {t("openDemo")}
            </DropdownMenuItem>
          )}
          {!lead.institutionId && actions.onLink && (
            <DropdownMenuItem onSelect={() => actions.onLink?.(lead)}>
              <Link2 />
              {t("linkInstitution")}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => actions.onAddNote(lead, "dissatisfied")}>
            <MessageSquareWarning />
            {tMenu("complaint")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}
