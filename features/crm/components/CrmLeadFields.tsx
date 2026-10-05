"use client";

import { useTranslations } from "next-intl";
import { Controller, useWatch, type UseFormReturn } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { LeadFormValues } from "@/lib/domain/crm/form";
import { FOLLOW_UP_STATUSES, addDaysIso } from "@/lib/domain/crm/offer";
import { CRM_STATUSES, type CrmStatus } from "@/lib/domain/crm/types";
import { followUpSuggestDays } from "@/lib/domain/tasks/rules";
import { LocationFields, type LocationKey } from "@/features/locations";
import { useCrmRules } from "../queries";
import { CrmFollowUpFields } from "./CrmFollowUpFields";

type LeadForm = UseFormReturn<LeadFormValues>;

/** Etiket + alan + alan hatası (form içinde). */
export function LeadField({
  id,
  label,
  error,
  className,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

/**
 * Aday formunun ortak alanları (ekleme ve düzenleme): kurum, yetkili, iletişim, konum, statü ve takip.
 * Statü seçilince sonraki arama alanı boşsa öneri tarihiyle dolar: günler takip kurallarından (Teklif verildi →
 * "offer" +3, Satış olmadı → "lostRecontact" +90; kural kapalıysa öneri yok).
 */
export function CrmLeadFields({
  form,
  idPrefix,
  offerDate,
  hideStatus = false,
}: {
  form: LeadForm;
  idPrefix: string;
  offerDate?: string | null;
  /** Aday panelinde statü başlıktaki satır içi seçiciden değişir; formda seçici çizilmez (takip alanları statüye göre yine görünür). */
  hideStatus?: boolean;
}) {
  const t = useTranslations("crm.form");
  const tStatus = useTranslations("crm.status");
  const {
    register,
    control,
    setValue,
    getValues,
    formState: { errors },
  } = form;
  const [status, nextCall, lostReason, city, district, country] = useWatch({
    control,
    name: ["status", "nextCall", "lostReason", "city", "district", "country"],
  });
  const id = (name: string) => `${idPrefix}-${name}`;

  const { rules } = useCrmRules();
  const onStatusPicked = (next: CrmStatus) => {
    if (getValues("nextCall")) return;
    const days = followUpSuggestDays(rules)[next];
    if (days != null) setValue("nextCall", addDaysIso(new Date(), days), { shouldDirty: true });
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <LeadField id={id("organizationName")} label={t("organizationName")} error={errors.organizationName?.message} className="col-span-2">
          <Input id={id("organizationName")} {...register("organizationName")} placeholder={t("organizationName")} autoComplete="organization" />
        </LeadField>
        <LeadField id={id("firstName")} label={t("firstName")} error={errors.firstName?.message}>
          <Input id={id("firstName")} {...register("firstName")} placeholder={t("firstName")} autoComplete="given-name" />
        </LeadField>
        <LeadField id={id("lastName")} label={t("lastName")} error={errors.lastName?.message}>
          <Input id={id("lastName")} {...register("lastName")} placeholder={t("lastName")} autoComplete="family-name" />
        </LeadField>
        <LeadField id={id("phone")} label={t("phone")} error={errors.phone?.message}>
          <Input type="tel" id={id("phone")} {...register("phone")} placeholder="05XX XXX XX XX" autoComplete="tel" />
        </LeadField>
        <LeadField id={id("email")} label={t("email")} error={errors.email?.message}>
          <Input type="email" id={id("email")} {...register("email")} placeholder="Ör. ad@kurum.com" autoComplete="email" />
        </LeadField>
        {!hideStatus && (
          <LeadField id={id("status")} label={t("status")}>
            <Controller
              control={control}
              name="status"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={(v) => {
                    field.onChange(v as CrmStatus);
                    onStatusPicked(v as CrmStatus);
                  }}
                >
                  <SelectTrigger id={id("status")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CRM_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {tStatus(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </LeadField>
        )}
        <LocationFields
          idPrefix={idPrefix}
          value={{ city, district, country }}
          onChange={(patch) => {
            for (const [key, v] of Object.entries(patch) as [LocationKey, string][]) setValue(key, v, { shouldDirty: true, shouldValidate: true });
          }}
          errors={{ city: errors.city?.message, district: errors.district?.message, country: errors.country?.message }}
        />
      </div>
      <p className="text-xs text-muted-foreground">{t("identityHint")}</p>
      {FOLLOW_UP_STATUSES.includes(status) && (
        <CrmFollowUpFields
          idPrefix={idPrefix}
          status={status}
          nextCall={nextCall}
          onNextCall={(v) => setValue("nextCall", v, { shouldDirty: true })}
          lostReason={lostReason}
          onLostReason={(v) => setValue("lostReason", v, { shouldDirty: true })}
          offerDate={status === "TEKLIF_VERILDI" ? offerDate : null}
          form={form}
        />
      )}
    </div>
  );
}

/** Tutar alanı (TR yazımı: "45.000", "12.500,50"). */
export function AmountField({ form, name, label, idPrefix }: { form: LeadForm; name: "offerAmount" | "saleAmount"; label: string; idPrefix: string }) {
  const t = useTranslations("crm.form");
  const id = `${idPrefix}-${name}`;
  return (
    <LeadField id={id} label={label} error={form.formState.errors[name]?.message}>
      <Input id={id} {...form.register(name)} inputMode="decimal" placeholder={t("amountPlaceholder")} />
    </LeadField>
  );
}
