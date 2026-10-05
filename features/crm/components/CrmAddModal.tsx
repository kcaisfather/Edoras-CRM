"use client";

import { useTranslations } from "next-intl";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { SIDE_PANEL_SURFACE } from "@/components/ui/side-panel";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/features/auth";
import { useApiErrorMessage } from "@/lib/hooks/use-api-error-message";
import { emptyLeadForm, formToCreate, leadFormRuleErrors, leadFormSchema, type LeadFormValues } from "@/lib/domain/crm/form";
import type { CrmLeadDto } from "@/lib/domain/crm/types";
import { useCreateCrmLead } from "../mutations";
import { applyLeadFieldErrors } from "./crm-edit/field-errors";
import { AmountField, CrmLeadFields } from "./CrmLeadFields";

/**
 * Yeni aday (DeepSport'taki "Yeni Kayıt" → yalnız CRM kaydı). Kullanıcı hesabı açma sihirbazı yerine Edoras'ta
 * demo, kaydedilen adayın detayından "Demo aç" ile açılır. Aktör sunucuda oturumdan yazılır. Aday paneli gibi sağdan açılır.
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className={cn("flex flex-col gap-0 overflow-hidden p-0 sm:max-w-xl", SIDE_PANEL_SURFACE)}>
        {open && <AddForm onClose={() => onOpenChange(false)} onCreated={onCreated} />}
      </SheetContent>
    </Sheet>
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

  const status = useWatch({ control: form.control, name: "status" });

  const onSubmit = (values: LeadFormValues) => {
    // Teklif / satış kuralları (lib/domain/crm/form.ts → leadFormRuleErrors; sunucu ve veritabanı da zorlar).
    const { status: statusError, ...amountErrors } = leadFormRuleErrors(values, { financial: canSeeFinancials });
    if (statusError) return void toast.error(statusError);
    for (const [field, message] of Object.entries(amountErrors)) form.setError(field as keyof LeadFormValues, { type: "rule", message });
    if (Object.keys(amountErrors).length) return;
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
      <SheetHeader className="space-y-1 border-b border-border px-5 pb-3 pr-12 pt-5 text-left">
        <SheetTitle>{t("title")}</SheetTitle>
        <SheetDescription>{t("description")}</SheetDescription>
      </SheetHeader>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col" noValidate>
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <CrmLeadFields form={form} idPrefix="crm-add" />
          {/* Teklif tutarı "Teklif verildi"de zorunlu ve temsilciye de açık; diğer tutarlar yalnız finans yetkisiyle. */}
          {(canSeeFinancials || status === "TEKLIF_VERILDI") && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-3">
                <AmountField form={form} name="offerAmount" label={tForm("offerAmount")} idPrefix="crm-add" />
              </div>
              <p className="text-xs text-muted-foreground">{tX("offer.amountHint")}</p>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-border bg-card px-5 py-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={create.isPending}>
            {tCommon("cancel")}
          </Button>
          <Button type="submit" disabled={create.isPending} aria-busy={create.isPending}>
            {create.isPending ? <Loader2 className="animate-spin" /> : null}
            {create.isPending ? tCommon("saving") : t("submit")}
          </Button>
        </div>
      </form>
    </>
  );
}
