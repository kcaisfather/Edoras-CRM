"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useForm, useWatch, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { HandCoins, Loader2, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { usePermissions } from "@/features/auth";
import { ApiError } from "@/lib/api/client";
import { useApiErrorMessage } from "@/lib/hooks/use-api-error-message";
import { parseAmount } from "@/lib/utils/money";
import { cn } from "@/lib/utils";
import { formToPatch, leadFormSchema, leadToForm, type LeadFormValues } from "@/lib/domain/crm/form";
import type { CrmLead } from "@/lib/domain/crm/types";
import { formatCrmDate, formatCurrency, getRemainingAmount } from "@/lib/domain/crm/utils";
import { useDeleteCrmLead, useUpdateCrmLead } from "../mutations";
import { AmountField, CrmLeadFields } from "./CrmLeadFields";
import { CrmLeadInstitution } from "./CrmLeadInstitution";

/** API alan adı → form alan adı (sunucunun 400 VALIDATION alan mesajları forma işlenir). */
const API_TO_FORM: Record<string, keyof LeadFormValues> = {
  organizationName: "organizationName",
  contactFirstName: "firstName",
  contactLastName: "lastName",
  contactEmail: "email",
  contactPhone: "phone",
  city: "city",
  district: "district",
  country: "country",
  nextFollowUpAt: "nextCall",
  offerAmount: "offerAmount",
  saleAmount: "saleAmount",
};

/** Sunucu alan hatalarını forma yazar; yazıldıysa true. */
export function applyLeadFieldErrors(form: UseFormReturn<LeadFormValues>, err: unknown): boolean {
  if (!(err instanceof ApiError) || !err.fields) return false;
  let applied = false;
  for (const [key, message] of Object.entries(err.fields)) {
    const field = API_TO_FORM[key];
    if (field) {
      form.setError(field, { type: "server", message });
      applied = true;
    }
  }
  return applied;
}

interface CrmEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: CrmLead | null;
  onDeleted?: () => void;
  /** Statü Satış Oldu'ya geçince — devir notunu açmak için (G22). */
  onSold?: (lead: CrmLead) => void;
  onOpenDemo?: (lead: CrmLead) => void;
  onLink?: (lead: CrmLead) => void;
  onAddCollection?: (lead: CrmLead) => void;
}

export function CrmEditModal({ open, onOpenChange, lead, ...rest }: CrmEditModalProps) {
  if (!lead) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        {/* key: başka aday ya da yeniden açılış → form kaydın güncel hâliyle başlar */}
        {open && <EditForm key={lead.id} lead={lead} onClose={() => onOpenChange(false)} {...rest} />}
      </DialogContent>
    </Dialog>
  );
}

function EditForm({
  lead,
  onClose,
  onDeleted,
  onSold,
  onOpenDemo,
  onLink,
  onAddCollection,
}: Omit<CrmEditModalProps, "open" | "onOpenChange" | "lead"> & { lead: CrmLead; onClose: () => void }) {
  const t = useTranslations("crm.edit");
  const tForm = useTranslations("crm.form");
  const tX = useTranslations("crm");
  const tCommon = useTranslations("common");
  const errorMessage = useApiErrorMessage();
  const { canSeeFinancials } = usePermissions();
  const update = useUpdateCrmLead();
  const remove = useDeleteCrmLead();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const form = useForm<LeadFormValues>({ resolver: zodResolver(leadFormSchema), defaultValues: leadToForm(lead) });
  const saleValue = useWatch({ control: form.control, name: "saleAmount" });
  const remaining = getRemainingAmount(parseAmount(saleValue) ?? 0, lead.collectedAmount);
  const busy = update.isPending || remove.isPending;

  const onSubmit = (values: LeadFormValues) => {
    update.mutate(
      { id: lead.id, data: formToPatch(values, lead, canSeeFinancials) },
      {
        onSuccess: () => {
          toast.success(t("success"));
          onClose();
          if (values.status === "SATIS_OLDU" && lead.status !== "SATIS_OLDU") onSold?.(lead);
        },
        onError: (err) => {
          if (!applyLeadFieldErrors(form, err)) toast.error(errorMessage(err, t("error")));
        },
      }
    );
  };

  const handleDelete = () => {
    remove.mutate(lead.id, {
      onSuccess: () => {
        toast.success(t("deleteSuccess"));
        setDeleteConfirmOpen(false);
        onClose();
        onDeleted?.();
      },
      onError: (err) => toast.error(errorMessage(err, t("deleteError"))),
    });
  };

  // Aksiyon başka pencere açar: önce bu pencere kapanır.
  const handOff = (fn?: (lead: CrmLead) => void) =>
    fn
      ? () => {
          onClose();
          fn(lead);
        }
      : undefined;
  const createdBy = lead.createdByName ?? (lead.createdBy ? tX("audit.unknown") : null);
  const updatedBy = lead.updatedByName ?? (lead.updatedBy ? tX("audit.unknown") : null);

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("title")}</DialogTitle>
        <DialogDescription>{t("description")}</DialogDescription>
        {(createdBy || updatedBy) && (
          <p className="text-xs text-muted-foreground">
            {createdBy && tX("audit.created", { name: createdBy, date: formatCrmDate(lead.createdAt) })}
            {createdBy && updatedBy && " · "}
            {updatedBy && tX("audit.updated", { name: updatedBy, date: formatCrmDate(lead.updatedAt) })}
          </p>
        )}
      </DialogHeader>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
        <section className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{tForm("leadSection")}</p>
          <CrmLeadFields form={form} idPrefix="crm-edit" offerDate={lead.offerSentAt} />
        </section>

        <div className="border-t border-border" />

        <section className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{tX("institution.title")}</p>
          <CrmLeadInstitution lead={lead} onOpenDemo={handOff(onOpenDemo)} onLink={handOff(onLink)} />
        </section>

        {/* EK-3: tutar alanları CRM_AGENT'a gösterilmez (sunucu da boş gönderir, gönderilse yok sayar). */}
        {canSeeFinancials && (
          <>
            <div className="border-t border-border" />
            <section className="space-y-3">
              <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{tForm("salesSection")}</p>
              <div className="grid grid-cols-2 gap-3">
                <AmountField form={form} name="offerAmount" label={tForm("offerAmount")} idPrefix="crm-edit" />
                <AmountField form={form} name="saleAmount" label={tForm("saleAmount")} idPrefix="crm-edit" />
                <div className="space-y-1.5">
                  <Label>{tForm("collectedAmount")}</Label>
                  <div className="flex h-9 items-center justify-between gap-2 rounded-md border border-border bg-muted/50 pl-3 pr-1 text-sm">
                    <span className="tabular-nums">{formatCurrency(lead.collectedAmount ?? 0)}</span>
                    {onAddCollection && (
                      <Button type="button" size="sm" variant="outline" className="h-7" onClick={handOff(onAddCollection)}>
                        <HandCoins />
                        {tX("list.addCollection")}
                      </Button>
                    )}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>{tForm("remainingAmount")}</Label>
                  <div
                    className={cn(
                      "flex h-9 items-center rounded-md border border-border bg-muted/50 px-3 text-sm font-semibold tabular-nums",
                      remaining > 0 ? "text-destructive" : "text-success"
                    )}
                  >
                    {formatCurrency(remaining)}
                  </div>
                </div>
                <p className="col-span-2 -mt-1 text-xs text-muted-foreground">
                  {tX("offer.amountHint")} {t("collectionHint")}
                </p>
              </div>
            </section>
          </>
        )}

        <DialogFooter className="sm:justify-between">
          <Button variant="destructive-outline" disabled={busy} onClick={() => setDeleteConfirmOpen(true)}>
            <Trash2 />
            {t("deleteButton")}
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" onClick={onClose} disabled={update.isPending}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={busy} aria-busy={update.isPending}>
              {update.isPending ? (
                <>
                  <Loader2 className="animate-spin" />
                  {tCommon("saving")}
                </>
              ) : (
                t("submit")
              )}
            </Button>
          </div>
        </DialogFooter>
      </form>

      <Dialog open={deleteConfirmOpen} onOpenChange={(next) => !remove.isPending && setDeleteConfirmOpen(next)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("deleteConfirmTitle")}</DialogTitle>
            <DialogDescription>{t("deleteConfirmDescription")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)} disabled={remove.isPending}>
              {tCommon("cancel")}
            </Button>
            <Button variant="destructive" disabled={remove.isPending} aria-busy={remove.isPending} onClick={handleDelete}>
              {remove.isPending ? <Loader2 className="animate-spin" /> : <Trash2 />}
              {remove.isPending ? t("deleting") : t("deleteConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
