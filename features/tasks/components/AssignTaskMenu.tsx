"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ListPlus, Loader2, PhoneCall } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useApiErrorMessage } from "@/lib/hooks/use-api-error-message";
import { todayIso } from "@/lib/domain/institutions/rules";
import { getLeadTitle } from "@/lib/domain/crm/utils";
import type { CrmLead } from "@/lib/domain/crm/types";
import { useAssignTask } from "../mutations";
import { AssignTaskDialog } from "./AssignTaskDialog";

/** Tıklanabilir tablo satırının (aday detayı) tetiklenmemesi için — portal içi olaylar da React ağacında kabarır. */
const stop = (e: React.SyntheticEvent) => e.stopPropagation();

export interface AssignTaskMenuProps {
  /** Görev atanacak CRM adayı. Yoksa düğme pasif çizilir ve "CRM kaydı gerekli" ipucu gösterilir. */
  lead: CrmLead | null | undefined;
  /** Mobil kartlar ve detay penceresi için etiketli (sm) düğme. */
  showLabel?: boolean;
  className?: string;
}

/**
 * Satır eylemi (DeepSport AssignTaskMenu): "Görev ata…" (diyalog) ve "Arama listesine ekle" (onaydan sonra bugüne,
 * havuza bir "Arama" görevi). Diyaloglar ilk kullanımda bağlanır; satır başına ek sorgu açılmaz.
 */
export function AssignTaskMenu({ lead, showLabel = false, className }: AssignTaskMenuProps) {
  const t = useTranslations("crm.tasks.assign");
  const [used, setUsed] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const size = showLabel ? "sm" : "icon-sm";

  if (!lead) {
    return (
      <span className={cn("inline-flex", className)} title={t("needsCrm")} onClick={stop} onKeyDown={stop}>
        <Button variant="ghost" size={size} disabled aria-label={`${t("menuLabel")}: ${t("needsCrm")}`}>
          <ListPlus />
          {showLabel && t("menuLabel")}
        </Button>
      </span>
    );
  }

  return (
    <span className={cn("inline-flex", className)} onClick={stop} onKeyDown={stop}>
      {/* modal={false}: menüden açılan diyalog kapanınca sayfa etkileşimsiz kalmasın. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size={size} aria-label={t("menuLabel")} title={t("menuLabel")}>
            <ListPlus />
            {showLabel && t("menuLabel")}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem
            onSelect={() => {
              setUsed(true);
              setDialogOpen(true);
            }}
          >
            <ListPlus />
            {t("menuAssign")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              setUsed(true);
              setConfirmOpen(true);
            }}
          >
            <PhoneCall />
            {t("menuCallList")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {used && (
        <>
          <AssignTaskDialog lead={lead} open={dialogOpen} onOpenChange={setDialogOpen} />
          <CallListConfirm lead={lead} open={confirmOpen} onOpenChange={setConfirmOpen} />
        </>
      )}
    </span>
  );
}

/** "Arama listesine ekle" onayı: bugüne, amaç "Arama", notsuz ve atanmamış (ekip havuzu) görev. */
function CallListConfirm({ lead, open, onOpenChange }: { lead: CrmLead; open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations("crm.tasks.assign");
  const tCommon = useTranslations("common");
  const assign = useAssignTask();
  const errorMessage = useApiErrorMessage();

  const confirm = async () => {
    if (assign.isPending) return;
    try {
      await assign.mutateAsync({ leadId: lead.id, dueDate: todayIso(), type: "arama", assigneeId: null });
      toast.success(t("callListSuccess"));
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err, t("error")));
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!assign.isPending) onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("callListTitle")}</DialogTitle>
          <DialogDescription>{t("callListBody", { name: getLeadTitle(lead).title })}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={assign.isPending}>
            {tCommon("cancel")}
          </Button>
          <Button onClick={() => void confirm()} disabled={assign.isPending} aria-busy={assign.isPending}>
            {assign.isPending && <Loader2 className="animate-spin" />}
            {t("callListConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
