"use client";

import { useTranslations } from "next-intl";
import { Controller, useWatch, type UseFormReturn } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { LeadFormValues } from "@/lib/domain/crm/form";
import { FOLLOW_UP_STATUSES, FOLLOW_UP_SUGGEST_DAYS, addDaysIso } from "@/lib/domain/crm/offer";
import { CRM_STATUSES, type CrmStatus } from "@/lib/domain/crm/types";
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
 * Statü seçilince sonraki arama alanı boşsa öneri tarihiyle dolar (Teklif +3, Satış olmadı +90 gün).
 */
export function CrmLeadFields({ form, idPrefix, offerDate }: { form: LeadForm; idPrefix: string; offerDate?: string | null }) {
  const t = useTranslations("crm.form");
  const tStatus = useTranslations("crm.status");
  const {
    register,
    control,
    setValue,
    getValues,
    formState: { errors },
  } = form;
  const [status, nextCall, lostReason] = useWatch({ control, name: ["status", "nextCall", "lostReason"] });
  const id = (name: string) => `${idPrefix}-${name}`;

  const onStatusPicked = (next: CrmStatus) => {
    if (getValues("nextCall")) return;
    const days = FOLLOW_UP_SUGGEST_DAYS[next];
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
        <LeadField id={id("city")} label={t("city")} error={errors.city?.message}>
          <Input id={id("city")} {...register("city")} placeholder={t("city")} />
        </LeadField>
        <LeadField id={id("district")} label={t("district")} error={errors.district?.message}>
          <Input id={id("district")} {...register("district")} placeholder={t("district")} />
        </LeadField>
        <LeadField id={id("country")} label={t("country")} error={errors.country?.message}>
          <Input id={id("country")} {...register("country")} placeholder={t("country")} />
        </LeadField>
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
