"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { formatTry, parseAmount } from "@/lib/utils/money";
import { licenseEndDate, renewalStartDate, todayIso } from "@/lib/domain/institutions/rules";
import {
  billingFormValues,
  billingSchema,
  contactSchema,
  convertSchema,
  paymentSchema,
  renewSchema,
  type BillingInput,
  type ContactInput,
  type ConvertInput,
  type PaymentInput,
  type RenewInput,
} from "@/lib/domain/institutions/schemas";
import type { InstitutionDetail } from "@/lib/domain/institutions/types";
import { useConvertToPaid, useRecordPayment, useRenewLicense, useUpdateBilling, useUpdateContact } from "../mutations";
import { formatDate } from "../format";
import { BillingFields, ContactFields, LicenseFields, PaymentFields, SelectField, TextField, applyServerFieldErrors } from "./fields";
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
  const form = useForm<BillingInput>({ resolver: zodResolver(billingSchema), defaultValues: billingFormValues(institution.billing) });
  useResetOnOpen(open, () => {
    form.reset(billingFormValues(institution.billing));
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
      <BillingFields />
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
    licensePrice: "",
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
  const form = useForm<RenewInput>({ resolver: zodResolver(renewSchema), defaultValues: { licensePrice: "" } });
  const lastPrice = institution.licenses[0]?.price ?? null;
  useResetOnOpen(open, () => {
    form.reset({ licensePrice: lastPrice != null ? String(lastPrice) : "" });
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
