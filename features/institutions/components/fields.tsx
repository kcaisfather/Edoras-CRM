"use client";

import { useTranslations } from "next-intl";
import { useFormContext, useWatch, type FieldValues, type Path, type UseFormReturn } from "react-hook-form";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { isIsoDate, licenseEndDate } from "@/lib/domain/institutions/rules";
import { PAYMENT_METHODS } from "@/lib/domain/institutions/types";
import { formatDate } from "../format";

const CONTROL =
  "flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm";

export function TextField({
  name,
  label,
  placeholder,
  type = "text",
  autoComplete,
  inputMode,
  description,
  multiline,
  className,
}: {
  name: string;
  label: string;
  placeholder?: string;
  type?: "text" | "email" | "tel" | "date";
  autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  description?: string;
  multiline?: boolean;
  className?: string;
}) {
  const { control } = useFormContext();
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            {multiline ? (
              <textarea {...field} rows={3} placeholder={placeholder} className={cn(CONTROL, "min-h-20 resize-y")} />
            ) : (
              <Input
                {...field}
                type={type}
                placeholder={placeholder}
                autoComplete={autoComplete ?? "off"}
                inputMode={inputMode}
              />
            )}
          </FormControl>
          {description ? <FormDescription>{description}</FormDescription> : null}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export function ChoiceField<T extends string>({
  name,
  label,
  options,
}: {
  name: string;
  label: string;
  options: readonly { value: T; label: string; disabled?: boolean }[];
}) {
  const { control } = useFormContext();
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <div>
            <SegmentedControl<T> value={field.value as T} onValueChange={field.onChange} options={options} aria-label={label} />
          </div>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export function SelectField({
  name,
  label,
  options,
  placeholder,
}: {
  name: string;
  label: string;
  options: readonly { value: string; label: string }[];
  placeholder?: string;
}) {
  const { control } = useFormContext();
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <select {...field} className={cn(CONTROL, "h-9 py-1")}>
              {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** Yetkili: ad soyad + telefon + e-posta (demo kuralı). */
export function ContactFields() {
  const t = useTranslations("institutions.form");
  return (
    <>
      <TextField name="contactName" label={t("contactName")} placeholder={t("contactNamePlaceholder")} autoComplete="name" />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="contactPhone" label={t("contactPhone")} type="tel" placeholder="05XX XXX XX XX" autoComplete="tel" />
        <TextField name="contactEmail" label={t("contactEmail")} type="email" placeholder="Ör. ad@kurum.com" autoComplete="email" />
      </div>
    </>
  );
}

/** Fatura: açık adres + TC Kimlik No ya da Vergi No (ücretli hesap ve ödeme kuralı). */
export function BillingFields() {
  const t = useTranslations("institutions.form");
  const idType = useWatch({ name: "idType" }) as "TC" | "VKN";
  return (
    <>
      <TextField name="address" label={t("address")} placeholder={t("addressPlaceholder")} multiline />
      <ChoiceField<"TC" | "VKN">
        name="idType"
        label={t("idType")}
        options={[
          { value: "TC", label: t("idTypeTc") },
          { value: "VKN", label: t("idTypeVkn") },
        ]}
      />
      <TextField
        name="idNumber"
        label={idType === "VKN" ? t("taxNo") : t("tcNo")}
        placeholder={idType === "VKN" ? "10 haneli Vergi No" : "11 haneli TC Kimlik No"}
        inputMode="numeric"
      />
    </>
  );
}

/**
 * Fatura profili (kurum ayrıntısı → "Fatura bilgileri"): BillingFields'ın alanları + unvan, vergi dairesi (yalnız kurumsal),
 * il, ilçe, posta kodu ve fatura e-postası. TC ⇔ bireysel, Vergi No ⇔ kurumsal (SQL: crm_institutions_billing_profile_check).
 */
export function BillingProfileFields() {
  const t = useTranslations("institutions.form");
  const idType = useWatch({ name: "idType" }) as "TC" | "VKN";
  const company = idType === "VKN";
  return (
    <>
      <ChoiceField<"TC" | "VKN">
        name="idType"
        label={t("idType")}
        options={[
          { value: "TC", label: t("idTypeTcHint") },
          { value: "VKN", label: t("idTypeVknHint") },
        ]}
      />
      <TextField name="legalName" label={company ? t("legalNameCompany") : t("legalNamePerson")} autoComplete="organization" />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          name="idNumber"
          label={company ? t("taxNo") : t("tcNo")}
          placeholder={company ? "10 haneli Vergi No" : "11 haneli TC Kimlik No"}
          inputMode="numeric"
        />
        {company ? <TextField name="taxOffice" label={t("taxOffice")} placeholder="Ör. Kadıköy" /> : null}
      </div>
      <TextField name="address" label={t("address")} placeholder={t("addressPlaceholder")} multiline />
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField name="city" label={t("city")} autoComplete="address-level1" />
        <TextField name="district" label={t("district")} autoComplete="address-level2" />
        <TextField name="postalCode" label={t("postalCode")} inputMode="numeric" autoComplete="postal-code" />
      </div>
      <TextField name="email" label={t("billingEmail")} type="email" description={t("billingEmailHint")} autoComplete="off" />
    </>
  );
}

/** Lisans: başlangıç + bedel; bitiş (1 yıl) önizlenir. */
export function LicenseFields({ withStart = true }: { withStart?: boolean }) {
  const t = useTranslations("institutions.form");
  const start = useWatch({ name: "licenseStartsOn" }) as string | undefined;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {withStart ? (
        <TextField
          name="licenseStartsOn"
          label={t("licenseStartsOn")}
          type="date"
          description={isIsoDate(start) ? t("licenseEndsPreview", { date: formatDate(licenseEndDate(start)) }) : undefined}
        />
      ) : null}
      <TextField name="licensePrice" label={t("licensePrice")} placeholder="Ör. 45.000" inputMode="decimal" />
    </div>
  );
}

export function PaymentFields() {
  const t = useTranslations("institutions.form");
  const tMethod = useTranslations("institutions.paymentMethod");
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <TextField name="payAmount" label={t("payAmount")} placeholder="Ör. 45.000" inputMode="decimal" />
      <SelectField
        name="payMethod"
        label={t("payMethod")}
        placeholder={t("payMethodPlaceholder")}
        options={PAYMENT_METHODS.map((m) => ({ value: m, label: tMethod(m) }))}
      />
      <TextField name="paidOn" label={t("paidOn")} type="date" />
    </div>
  );
}

/** Sunucunun alan hatalarını (400 VALIDATION → fields) forma işler. İşlendiyse true. */
export function applyServerFieldErrors<T extends FieldValues>(form: UseFormReturn<T>, err: unknown): boolean {
  if (!(err instanceof ApiError) || !err.fields) return false;
  let applied = false;
  for (const [key, message] of Object.entries(err.fields)) {
    if (key in form.getValues()) {
      form.setError(key as Path<T>, { type: "server", message });
      applied = true;
    }
  }
  return applied;
}
