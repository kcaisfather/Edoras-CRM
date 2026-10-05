"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { formatTry, parseAmount } from "@/lib/utils/money";
import { licenseEndDate, renewalStartDate, todayIso } from "@/lib/domain/institutions/rules";
import { licensePriceFormValues } from "@/lib/domain/institutions/pricing";
import { useApiErrorMessage } from "@/lib/hooks/use-api-error-message";
import {
  billingFormValues,
  billingProfileFormValues,
  billingSchema,
  contactSchema,
  convertSchema,
  licenseEditSchema,
  paymentEditSchema,
  paymentSchema,
  renewSchema,
  type BillingInput,
  type ContactInput,
  type ConvertInput,
  type LicenseEditInput,
  type PaymentInput,
  type RenewInput,
} from "@/lib/domain/institutions/schemas";
import type { InstitutionDetail, License, Payment } from "@/lib/domain/institutions/types";
import {
  useConvertToPaid,
  useDeletePayment,
  useRecordPayment,
  useRenewLicense,
  useUpdateBilling,
  useUpdateContact,
  useUpdateLicense,
  useUpdatePayment,
} from "../mutations";
import { formatDate } from "../format";
import { BillingFields, BillingProfileFields, ContactFields, LicenseFields, PaymentFields, SelectField, TextField, applyServerFieldErrors } from "./fields";
import { FormDialog } from "./FormDialog";

interface DialogProps {
  institution: InstitutionDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Pencere her açılışta kaydın güncel değerleriyle başlar. */
function useResetOnOpen(open: boolean, reset: () => void) {
  useEffect(() => {
    if (open) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}

export function ContactDialog({ institution, open, onOpenChange }: DialogProps) {
  const t = useTranslations("institutions.dialogs.contact");
  const mutation = useUpdateContact(institution.id);
  const initial = (): ContactInput => ({
    contactName: institution.crm?.contactName ?? "",
    contactPhone: institution.crm?.contactPhone ?? "",
    contactEmail: institution.crm?.contactEmail ?? "",
  });
  const form = useForm<ContactInput>({ resolver: zodResolver(contactSchema), defaultValues: initial() });
  useResetOnOpen(open, () => {
    form.reset(initial());
    mutation.reset();
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("title")}
      description={t("description")}
      form={form}
      submitLabel={t("submit")}
      pending={mutation.isPending}
      error={mutation.error}
      onSubmit={(values) =>
        mutation.mutate(values, {
          onSuccess: () => {
            toast.success(t("saved"));
            onOpenChange(false);
          },
          onError: (err) => applyServerFieldErrors(form, err),
        })
      }
    >
      <ContactFields />
    </FormDialog>
  );
}

export function BillingDialog({ institution, open, onOpenChange }: DialogProps) {
  const t = useTranslations("institutions.dialogs.billing");
  const mutation = useUpdateBilling(institution.id);
  // Kayıt yoksa unvan = kurum adı, fatura e-postası = yetkili e-postası önerilir (yönetici değiştirebilir).
  const initial = (): BillingInput =>
    billingProfileFormValues(institution.billing, { legalName: institution.name, email: institution.crm?.contactEmail ?? "" });
  const form = useForm<BillingInput>({ resolver: zodResolver(billingSchema), defaultValues: initial() });
  useResetOnOpen(open, () => {
    form.reset(initial());
    mutation.reset();
  });

  return (
    <FormDialog
      wide
      open={open}
      onOpenChange={onOpenChange}
      title={t("title")}
      description={t("description")}
      form={form}
      submitLabel={t("submit")}
      pending={mutation.isPending}
      error={mutation.error}
      onSubmit={(values) =>
        mutation.mutate(values, {
          onSuccess: () => {
            toast.success(t("saved"));
            onOpenChange(false);
          },
          onError: (err) => applyServerFieldErrors(form, err),
        })
      }
    >
      <BillingProfileFields />
    </FormDialog>
  );
}

/** Demo → ücretli: fatura bilgisi (zorunlu) + 1 yıllık lisans + isteğe bağlı ilk ödeme. */
export function ConvertDialog({ institution, open, onOpenChange }: DialogProps) {
  const t = useTranslations("institutions.dialogs.convert");
  const mutation = useConvertToPaid(institution.id);
  const initial = (): ConvertInput => ({
    ...billingFormValues(institution.billing),
    licenseStartsOn: todayIso(),
    ...licensePriceFormValues(null),
    withPayment: false,
    payAmount: "",
    payMethod: "",
    paidOn: todayIso(),
  });
  const form = useForm<ConvertInput>({ resolver: zodResolver(convertSchema), defaultValues: initial() });
  const withPayment = useWatch({ control: form.control, name: "withPayment" });
  useResetOnOpen(open, () => {
    form.reset(initial());
    mutation.reset();
  });

  return (
    <FormDialog
      wide
      open={open}
      onOpenChange={onOpenChange}
      title={t("title")}
      description={t("description")}
      form={form}
      submitLabel={t("submit")}
      pending={mutation.isPending}
      error={mutation.error}
      onSubmit={(values) =>
        mutation.mutate(values, {
          onSuccess: () => {
            toast.success(t("saved"));
            onOpenChange(false);
          },
          onError: (err) => applyServerFieldErrors(form, err),
        })
      }
    >
      <p className="text-sm font-semibold">{t("billingSection")}</p>
      <BillingFields />
      <p className="pt-2 text-sm font-semibold">{t("licenseSection")}</p>
      <LicenseFields />
      <div className="flex items-center gap-2 pt-2">
        <Checkbox
          id="convert-with-payment"
          checked={withPayment}
          onCheckedChange={(v) => form.setValue("withPayment", v === true, { shouldValidate: false })}
        />
        <Label htmlFor="convert-with-payment">{t("withPayment")}</Label>
      </div>
      {withPayment ? <PaymentFields /> : null}
    </FormDialog>
  );
}

/** Lisans yenile: süren lisansın bitişinden (bitmişse bugünden) 1 yıl. */
export function RenewDialog({ institution, open, onOpenChange }: DialogProps) {
  const t = useTranslations("institutions.dialogs.renew");
  const mutation = useRenewLicense(institution.id);
  // Yenileme son lisansın koşuluyla başlar (aynı indirim ya da aynı elle bedel); yönetici değiştirebilir.
  const last = institution.licenses[0] ?? null;
  const lastPrice = last?.price ?? null;
  const form = useForm<RenewInput>({ resolver: zodResolver(renewSchema), defaultValues: licensePriceFormValues(last) });
  useResetOnOpen(open, () => {
    form.reset(licensePriceFormValues(last));
    mutation.reset();
  });
  const start = renewalStartDate(institution.licenseEndsOn, todayIso());

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("title")}
      description={t("description", { start: formatDate(start), end: formatDate(licenseEndDate(start)) })}
      form={form}
      submitLabel={t("submit")}
      pending={mutation.isPending}
      error={mutation.error}
      onSubmit={(values) =>
        mutation.mutate(values, {
          onSuccess: () => {
            toast.success(t("saved"));
            onOpenChange(false);
          },
          onError: (err) => applyServerFieldErrors(form, err),
        })
      }
    >
      <LicenseFields withStart={false} />
      {lastPrice != null ? <p className="text-xs text-muted-foreground">{t("lastPrice", { amount: formatTry(lastPrice) })}</p> : null}
    </FormDialog>
  );
}

export function PaymentDialog({ institution, open, onOpenChange }: DialogProps) {
  const t = useTranslations("institutions.dialogs.payment");
  const mutation = useRecordPayment(institution.id);
  const initial = (): PaymentInput => ({
    payAmount: "",
    payMethod: "",
    paidOn: todayIso(),
    licenseId: institution.licenses[0]?.id ?? "",
    note: "",
  });
  const form = useForm<PaymentInput>({ resolver: zodResolver(paymentSchema), defaultValues: initial() });
  const amount = parseAmount(useWatch({ control: form.control, name: "payAmount" }));
  useResetOnOpen(open, () => {
    form.reset(initial());
    mutation.reset();
  });

  return (
    <FormDialog
      wide
      open={open}
      onOpenChange={onOpenChange}
      title={t("title")}
      description={t("description")}
      form={form}
      submitLabel={amount ? t("submitAmount", { amount: formatTry(amount) }) : t("submit")}
      pending={mutation.isPending}
      error={mutation.error}
      onSubmit={(values) =>
        mutation.mutate(values, {
          onSuccess: () => {
            toast.success(t("saved"));
            onOpenChange(false);
          },
          onError: (err) => applyServerFieldErrors(form, err),
        })
      }
    >
      <PaymentFields />
      {institution.licenses.length > 0 ? (
        <SelectField
          name="licenseId"
          label={t("license")}
          placeholder={t("noLicense")}
          options={institution.licenses.map((l) => ({
            value: l.id,
            label: `${formatDate(l.startsOn)} – ${formatDate(l.endsOn)}`,
          }))}
        />
      ) : null}
      <TextField name="note" label={t("note")} placeholder={t("notePlaceholder")} />
    </FormDialog>
  );
}

/** Kayıttan sonra lisans düzeltme (ADMIN): başlangıç (bitiş +1 yıl), indirim yüzdesi ya da elle bedel, not. */
export function LicenseEditDialog({ institution, license, open, onOpenChange }: DialogProps & { license: License }) {
  const t = useTranslations("institutions.dialogs.licenseEdit");
  const mutation = useUpdateLicense(institution.id);
  const initial = (): LicenseEditInput => ({
    licenseStartsOn: license.startsOn,
    ...licensePriceFormValues(license),
    note: license.note ?? "",
  });
  const form = useForm<LicenseEditInput>({ resolver: zodResolver(licenseEditSchema), defaultValues: initial() });
  useResetOnOpen(open, () => {
    form.reset(initial());
    mutation.reset();
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("title")}
      description={t("description")}
      form={form}
      submitLabel={t("submit")}
      pending={mutation.isPending}
      error={mutation.error}
      onSubmit={(input) =>
        mutation.mutate(
          { licenseId: license.id, input },
          {
            onSuccess: () => {
              toast.success(t("saved"));
              onOpenChange(false);
            },
            onError: (err) => applyServerFieldErrors(form, err),
          }
        )
      }
    >
      <LicenseFields listPrice={license.listPrice} />
      <TextField name="note" label={t("note")} placeholder={t("notePlaceholder")} />
    </FormDialog>
  );
}

/** Ödeme düzeltme / silme (ADMIN). Faturası kesilmiş ödemede sunucu 409 SALE_INVOICED döner. */
export function PaymentEditDialog({ institution, payment, open, onOpenChange }: DialogProps & { payment: Payment }) {
  const t = useTranslations("institutions.dialogs.paymentEdit");
  const tPayment = useTranslations("institutions.dialogs.payment");
  const errorText = useApiErrorMessage();
  const mutation = useUpdatePayment(institution.id);
  const remove = useDeletePayment(institution.id);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const initial = (): PaymentInput => ({
    payAmount: String(payment.amount).replace(".", ","),
    payMethod: payment.method,
    paidOn: payment.paidOn,
    licenseId: payment.licenseId ?? "",
    note: payment.note ?? "",
  });
  const form = useForm<PaymentInput>({ resolver: zodResolver(paymentEditSchema), defaultValues: initial() });
  useResetOnOpen(open, () => {
    form.reset(initial());
    mutation.reset();
    remove.reset();
    setConfirmDelete(false);
  });
  const pending = mutation.isPending || remove.isPending;

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    remove.mutate(payment.id, {
      onSuccess: () => {
        toast.success(t("deleted"));
        onOpenChange(false);
      },
      onError: (err) => {
        toast.error(errorText(err));
        setConfirmDelete(false);
      },
    });
  };

  return (
    <FormDialog
      wide
      open={open}
      onOpenChange={(next) => !pending && onOpenChange(next)}
      title={t("title")}
      description={t("description")}
      form={form}
      submitLabel={t("submit")}
      pending={pending}
      error={mutation.error}
      onSubmit={(input) =>
        mutation.mutate(
          { paymentId: payment.id, input },
          {
            onSuccess: () => {
              toast.success(t("saved"));
              onOpenChange(false);
            },
            onError: (err) => applyServerFieldErrors(form, err),
          }
        )
      }
    >
      <PaymentFields />
      {institution.licenses.length > 0 ? (
        <SelectField
          name="licenseId"
          label={tPayment("license")}
          placeholder={tPayment("noLicense")}
          options={institution.licenses.map((l) => ({
            value: l.id,
            label: `${formatDate(l.startsOn)} – ${formatDate(l.endsOn)}`,
          }))}
        />
      ) : null}
      <TextField name="note" label={tPayment("note")} placeholder={tPayment("notePlaceholder")} />
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-destructive/25 bg-destructive/5 p-3">
        <p className="text-xs text-muted-foreground">{confirmDelete ? t("deleteConfirm") : t("deleteHint")}</p>
        <Button type="button" variant={confirmDelete ? "destructive" : "outline"} size="sm" disabled={pending} onClick={handleDelete}>
          {remove.isPending ? <Loader2 className="animate-spin" /> : <Trash2 />}
          {confirmDelete ? t("deleteConfirmButton") : t("delete")}
        </Button>
      </div>
    </FormDialog>
  );
}
