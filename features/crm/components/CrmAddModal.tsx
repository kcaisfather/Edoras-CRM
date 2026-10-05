"use client";

import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/features/auth";
import { useApiErrorMessage } from "@/lib/hooks/use-api-error-message";
import { emptyLeadForm, formToCreate, leadFormSchema, type LeadFormValues } from "@/lib/domain/crm/form";
import type { CrmLeadDto } from "@/lib/domain/crm/types";
import { useCreateCrmLead } from "../mutations";
import { applyLeadFieldErrors } from "./crm-edit/field-errors";
import { AmountField, CrmLeadFields } from "./CrmLeadFields";

/**
 * Yeni aday (DeepSport'taki "Yeni Kayıt" → yalnız CRM kaydı). Kullanıcı hesabı açma sihirbazı yerine Edoras'ta
 * demo, kaydedilen adayın detayından "Demo aç" ile açılır. Aktör sunucuda oturumdan yazılır.
 */
export function CrmAddModal({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (lead: CrmLeadDto) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        {open && <AddForm onClose={() => onOpenChange(false)} onCreated={onCreated} />}
      </DialogContent>
    </Dialog>
  );
}

function AddForm({ onClose, onCreated }: { onClose: () => void; onCreated?: (lead: CrmLeadDto) => void }) {
  const t = useTranslations("crm.add");
  const tForm = useTranslations("crm.form");
  const tX = useTranslations("crm");
  const tCommon = useTranslations("common");
  const errorMessage = useApiErrorMessage();
  const { canSeeFinancials } = usePermissions();
  const create = useCreateCrmLead();
  const form = useForm<LeadFormValues>({ resolver: zodResolver(leadFormSchema), defaultValues: emptyLeadForm() });

  const onSubmit = (values: LeadFormValues) => {
    create.mutate(formToCreate(values, canSeeFinancials), {
      onSuccess: (lead) => {
        toast.success(t("success"));
        onClose();
        onCreated?.(lead);
      },
      onError: (err) => {
        if (!applyLeadFieldErrors(form, err)) toast.error(errorMessage(err, t("error")));
      },
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("title")}</DialogTitle>
        <DialogDescription>{t("description")}</DialogDescription>
      </DialogHeader>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
        <CrmLeadFields form={form} idPrefix="crm-add" />
        {canSeeFinancials && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-3">
              <AmountField form={form} name="offerAmount" label={tForm("offerAmount")} idPrefix="crm-add" />
            </div>
            <p className="text-xs text-muted-foreground">{tX("offer.amountHint")}</p>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={create.isPending}>
            {tCommon("cancel")}
          </Button>
          <Button type="submit" disabled={create.isPending} aria-busy={create.isPending}>
            {create.isPending ? <Loader2 className="animate-spin" /> : null}
            {create.isPending ? tCommon("saving") : t("submit")}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
