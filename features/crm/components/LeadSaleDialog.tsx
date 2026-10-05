"use client";

/**
 * "Satış oldu" penceresi (kurucu kararı 2026-10-05): satış tutarı + firma / fatura bilgileri zorunlu; kaydedilince hesap
 * aynı adımda açılır (POST /api/crm/leads/{id}/sale — lib/server/crm-leads.ts recordLeadSale). Hesap yolu adayın
 * durumundan: bağlı değilse Edoras'ta yeni kurum + kurum yöneticisi (kurum adı, program, yetkili istenir; geçici şifre
 * bir kez gösterilir), DEMO kurumsa ücretliye geçiş, kayıtsız kurumsa ücretli kayda alma, ücretliyse yalnız fatura
 * bilgisi. Statü seçicinin (StatusDropdown) "Satış oldu" seçeneği bu pencereyi açar. Temsilci de kaydeder.
 */
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { AlertCircle, BadgeCheck, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { usePermissions } from "@/features/auth";
import {
  BillingProfileFields,
  ChoiceField,
  ContactFields,
  CredentialsPanel,
  TextField,
  applyServerFieldErrors,
  programLabel,
  useInstitution,
} from "@/features/institutions";
import { apiErrorCode } from "@/lib/api/errors";
import { useApiErrorMessage } from "@/lib/hooks/use-api-error-message";
import { leadSaleFormValues, leadSaleSchema, saleAccountMode, type LeadSaleInput, type LeadSaleResult } from "@/lib/domain/crm/sale";
import type { CrmLead } from "@/lib/domain/crm/types";
import { formatCurrency, getLeadDisplayName } from "@/lib/domain/crm/utils";
import { useRecordSale } from "../mutations";

export function LeadSaleDialog({
  lead,
  onClose,
  onSold,
}: {
  lead: CrmLead;
  onClose: () => void;
  /** Satış kaydedilip pencere kapanınca (devir notu penceresi). */
  onSold?: (lead: CrmLead) => void;
}) {
  const t = useTranslations("crm.sale");
  const tCommon = useTranslations("common");
  const errorMessage = useApiErrorMessage();
  const { canSeeFinancials } = usePermissions();
  const sale = useRecordSale();
  const [done, setDone] = useState<LeadSaleResult | null>(null);
  const mode = saleAccountMode(lead);
  const institutionName = lead.institution?.name ?? "";

  const form = useForm<LeadSaleInput>({ resolver: zodResolver(leadSaleSchema), defaultValues: leadSaleFormValues(lead) });

  // Bağlı kurumun kayıtlı fatura profili (yalnız yönetici görür; temsilciye sunucu boş döndürür) formu bir kez doldurur.
  const institution = useInstitution(canSeeFinancials && lead.institutionId ? lead.institutionId : "");
  const prefilled = useRef(false);
  const billing = institution.data?.billing ?? null;
  useEffect(() => {
    if (prefilled.current || !billing || form.formState.isDirty) return;
    prefilled.current = true;
    form.reset({ ...leadSaleFormValues(lead, billing), saleAmount: form.getValues("saleAmount") });
  }, [billing, form, lead]);

  const finish = (result: LeadSaleResult) => {
    onClose();
    onSold?.({ ...lead, ...result.lead });
  };

  const submit = (values: LeadSaleInput) => {
    sale.mutate(
      { id: lead.id, data: { ...values, account: mode } },
      {
        onSuccess: (result) => {
          toast.success(t("saved"));
          // Yeni hesap: şifre yalnız bu yanıtta — pencere giriş bilgisini gösterir, "Tamam" ile kapanır.
          if (result.credentials) setDone(result);
          else finish(result);
        },
        onError: (err) => {
          const code = apiErrorCode(err);
          if (code === "EMAIL_TAKEN") form.setError("contactEmail", { message: t("emailTaken") });
          if (code === "INSTITUTION_NAME_TAKEN") form.setError("institutionName", { message: t("nameTaken") });
          applyServerFieldErrors(form, err);
        },
      }
    );
  };

  const close = (open: boolean) => {
    if (open || sale.isPending) return;
    if (done) finish(done);
    else onClose();
  };

  return (
    <Dialog open onOpenChange={close}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BadgeCheck className="h-5 w-5 text-success" />
            {done ? t("doneTitle") : t("title")}
          </DialogTitle>
          <DialogDescription>{done ? t("doneDescription") : t("description", { name: getLeadDisplayName(lead) })}</DialogDescription>
        </DialogHeader>

        {done?.credentials ? (
          <CredentialsPanel credentials={done.credentials} endsLabel={t("licenseEndsAt")} />
        ) : (
          <Form {...form}>
            <form id="lead-sale-form" className="space-y-5" noValidate onSubmit={form.handleSubmit(submit)}>
              <section className="space-y-3">
                <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t("amountSection")}</p>
                <TextField
                  name="saleAmount"
                  label={t("saleAmount")}
                  placeholder="Ör. 45.000"
                  inputMode="decimal"
                  description={lead.offerAmount ? t("offerWas", { amount: formatCurrency(lead.offerAmount) }) : undefined}
                />
              </section>

              <section className="space-y-3">
                <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t("accountSection")}</p>
                <p className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                  {t(`mode.${mode}`, { name: institutionName })}
                </p>
                {mode === "NEW" && (
                  <>
                    <TextField name="institutionName" label={t("institutionName")} autoComplete="organization" />
                    <ChoiceField<"yks" | "lgs">
                      name="program"
                      label={t("program")}
                      options={[
                        { value: "yks", label: programLabel("yks") },
                        { value: "lgs", label: programLabel("lgs") },
                      ]}
                    />
                  </>
                )}
                {(mode === "NEW" || mode === "ENROLL") && <ContactFields />}
              </section>

              <section className="space-y-3">
                <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t("billingSection")}</p>
                <BillingProfileFields />
              </section>
            </form>
          </Form>
        )}

        {sale.isError && !done ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{errorMessage(sale.error, t("error"))}</AlertDescription>
          </Alert>
        ) : null}

        <DialogFooter className="gap-2">
          {done ? (
            <Button onClick={() => finish(done)}>{t("continue")}</Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose} disabled={sale.isPending}>
                {tCommon("cancel")}
              </Button>
              <Button type="submit" form="lead-sale-form" disabled={sale.isPending} aria-busy={sale.isPending}>
                {sale.isPending ? <Loader2 className="animate-spin" /> : null}
                {mode === "PAID" ? t("submit") : t("submitNew")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
