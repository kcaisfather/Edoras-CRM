"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { usePermissions } from "@/features/auth";
import { demoEndDate, isIsoDate, todayIso } from "@/lib/domain/institutions/rules";
import { enrollSchema, type EnrollInput } from "@/lib/domain/institutions/schemas";
import type { InstitutionDetail } from "@/lib/domain/institutions/types";
import { useEnrollInstitution } from "../mutations";
import { formatDate } from "../format";
import { BillingFields, ChoiceField, ContactFields, LicenseFields, TextField, applyServerFieldErrors } from "./fields";
import { FormDialog } from "./FormDialog";

const initial = (): EnrollInput => ({
  status: "DEMO",
  contactName: "",
  contactPhone: "",
  contactEmail: "",
  demoStartsOn: todayIso(),
  address: "",
  idType: "TC",
  idNumber: "",
  licenseStartsOn: todayIso(),
  licensePrice: "",
});

/**
 * CRM öncesinden kalan kurumu kayda alır. Demo: yetkili bilgisi + demonun gerçek başlangıcı (bitiş +1 yıl).
 * Ücretli (yalnız ADMIN): fatura bilgisi + süren lisansın başlangıcı da zorunlu. Kurumun Edoras hesabına dokunmaz.
 */
export function EnrollDialog({
  institution,
  open,
  onOpenChange,
}: {
  institution: InstitutionDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("institutions.dialogs.enroll");
  const { isAdmin } = usePermissions();
  const mutation = useEnrollInstitution(institution.id);
  const form = useForm<EnrollInput>({ resolver: zodResolver(enrollSchema), defaultValues: initial() });
  const status = useWatch({ control: form.control, name: "status" });
  const demoStart = useWatch({ control: form.control, name: "demoStartsOn" });

  useEffect(() => {
    if (open) {
      form.reset(initial());
      mutation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <FormDialog
      wide
      open={open}
      onOpenChange={onOpenChange}
      title={t("title")}
      description={t("description", { name: institution.name })}
      form={form}
      submitLabel={status === "UCRETLI" ? t("submitPaid") : t("submitDemo")}
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
      <ChoiceField<"DEMO" | "UCRETLI">
        name="status"
        label={t("status")}
        options={[
          { value: "DEMO", label: t("statusDemo") },
          { value: "UCRETLI", label: t("statusPaid"), disabled: !isAdmin },
        ]}
      />
      <ContactFields />
      {status === "DEMO" ? (
        <TextField
          name="demoStartsOn"
          label={t("demoStartsOn")}
          type="date"
          description={isIsoDate(demoStart) ? t("demoEndsPreview", { date: formatDate(demoEndDate(demoStart)) }) : undefined}
        />
      ) : null}
      {status === "UCRETLI" ? (
        <>
          <p className="pt-2 text-sm font-semibold">{t("billingSection")}</p>
          <BillingFields />
          <p className="pt-2 text-sm font-semibold">{t("licenseSection")}</p>
          <LicenseFields />
        </>
      ) : null}
    </FormDialog>
  );
}
