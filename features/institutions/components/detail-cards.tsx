"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  CalendarClock,
  FileText,
  Mail,
  MessageCircle,
  Pencil,
  Phone,
  Receipt,
  ShieldCheck,
  UserRound,
  UsersRound,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Money } from "@/components/ui/money";
import { FinancialOnly, usePermissions } from "@/features/auth";
import { toTelLink, toWhatsAppLink } from "@/lib/utils/phone";
import { cn } from "@/lib/utils";
import { billingProfileCompleteness, effectiveBillingType } from "@/lib/domain/institutions/billing-profile";
import { daysBetween, todayIso } from "@/lib/domain/institutions/rules";
import type { InstitutionDetail, License, Payment } from "@/lib/domain/institutions/types";
import { formatDate, formatDateTime, formatPhone } from "../format";
import { BillingDialog, ContactDialog, PaymentDialog, RenewDialog } from "./dialogs";

export function SectionCard({
  icon: Icon,
  title,
  action,
  children,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("glass-panel rounded-2xl border-border/50 p-6", className)}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold leading-tight">
          <Icon className="h-5 w-5 text-primary" />
          {title}
        </h2>
        {action}
      </div>
      {children}
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-sm">{children}</dd>
    </div>
  );
}

export function ContactCard({ institution }: { institution: InstitutionDetail }) {
  const t = useTranslations("institutions.detail.contact");
  const [open, setOpen] = useState(false);
  const crm = institution.crm;
  if (!crm) return null;
  const tel = toTelLink(crm.contactPhone);
  const whatsapp = toWhatsAppLink(crm.contactPhone);
  return (
    <SectionCard
      icon={UserRound}
      title={t("title")}
      action={
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Pencil />
          {t("edit")}
        </Button>
      }
    >
      <dl className="grid gap-4 sm:grid-cols-3">
        <Field label={t("name")}>{crm.contactName}</Field>
        <Field label={t("phone")}>
          <span className="flex flex-wrap items-center gap-2">
            {formatPhone(crm.contactPhone)}
            {tel ? (
              <a href={tel} className="text-primary hover:underline" aria-label={t("call")} title={t("call")}>
                <Phone className="h-3.5 w-3.5" />
              </a>
            ) : null}
            {whatsapp ? (
              <a href={whatsapp} target="_blank" rel="noreferrer" className="text-primary hover:underline" aria-label="WhatsApp" title="WhatsApp">
                <MessageCircle className="h-3.5 w-3.5" />
              </a>
            ) : null}
          </span>
        </Field>
        <Field label={t("email")}>
          <a href={`mailto:${crm.contactEmail}`} className="inline-flex items-center gap-1.5 text-primary hover:underline">
            <Mail className="h-3.5 w-3.5" />
            {crm.contactEmail}
          </a>
        </Field>
      </dl>
      <ContactDialog institution={institution} open={open} onOpenChange={setOpen} />
    </SectionCard>
  );
}

export function BillingCard({ institution }: { institution: InstitutionDetail }) {
  const t = useTranslations("institutions.detail.billing");
  const { isAdmin } = usePermissions();
  const [open, setOpen] = useState(false);
  const crm = institution.crm;
  if (!crm) return null;
  const billing = institution.billing;
  return (
    <SectionCard
      icon={FileText}
      title={t("title")}
      action={
        isAdmin ? (
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            <Pencil />
            {crm.billingComplete ? t("edit") : t("add")}
          </Button>
        ) : null
      }
    >
      {!crm.billingComplete ? (
        <p className="mb-4 flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t("missing")}
        </p>
      ) : null}
      {billing ? (
        <BillingDetails billing={billing} />
      ) : (
        <p className="text-sm text-muted-foreground">
          {!crm.billingComplete ? t("hiddenMissing") : crm.billingProfileComplete ? t("hiddenComplete") : t("hiddenProfileMissing")}
        </p>
      )}
      {isAdmin ? <BillingDialog institution={institution} open={open} onOpenChange={setOpen} /> : null}
    </SectionCard>
  );
}

/** Fatura profili ayrıntısı (yalnız ADMIN): tür, unvan, kimlik, vergi dairesi, adres, il/ilçe, fatura e-postası + tamlık notu. */
function BillingDetails({ billing }: { billing: NonNullable<InstitutionDetail["billing"]> }) {
  const t = useTranslations("institutions.detail.billing");
  const type = effectiveBillingType(billing);
  const completeness = billingProfileCompleteness(billing);
  return (
    <>
      {billing.address && (billing.taxNo || billing.tcNo) && !completeness.complete ? (
        <p className="mb-4 flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t("profileIncomplete")}
        </p>
      ) : null}
      <dl className="grid gap-4">
        <Field label={t("type")}>{t(`types.${type}`)}</Field>
        <Field label={t("legalName")}>{billing.legalName ?? "—"}</Field>
        {type === "COMPANY" ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <Field label={t("taxNo")}>{billing.taxNo ?? "—"}</Field>
            <Field label={t("taxOffice")}>{billing.taxOffice ?? "—"}</Field>
          </div>
        ) : (
          <Field label={t("tcNo")}>{billing.tcNo ?? "—"}</Field>
        )}
        <Field label={t("address")}>{billing.address ?? "—"}</Field>
        <Field label={t("location")}>{[billing.district, billing.city].filter(Boolean).join(" / ") || "—"}</Field>
        {billing.postalCode ? <Field label={t("postalCode")}>{billing.postalCode}</Field> : null}
        <Field label={t("email")}>{billing.email ?? "—"}</Field>
        {billing.eInvoiceRegistered != null ? <Field label={t("eInvoice")}>{billing.eInvoiceRegistered ? t("eInvoice") : t("eArchive")}</Field> : null}
      </dl>
    </>
  );
}

/** Demo: 1 dönem (1 yıl). Başlangıç, bitiş, kalan gün. Süre dolunca kurum kapanmaz, yalnız burada görünür. */
export function DemoCard({ institution }: { institution: InstitutionDetail }) {
  const t = useTranslations("institutions.detail.demo");
  const crm = institution.crm;
  if (!crm || crm.status !== "DEMO" || !crm.demoEndsAt) return null;
  const left = daysBetween(todayIso(), crm.demoEndsAt);

  return (
    <SectionCard icon={CalendarClock} title={t("title")}>
      <dl className="grid grid-cols-2 gap-4">
        <Field label={t("started")}>{formatDate(crm.demoStartedAt)}</Field>
        <Field label={t("ends")}>{formatDate(crm.demoEndsAt)}</Field>
      </dl>
      <p className={cn("mt-4 text-sm font-medium", left > 0 ? "text-primary" : "text-warning")}>
        {left > 0 ? t("daysLeft", { days: left }) : left === 0 ? t("endedToday") : t("ended", { days: -left })}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{t("rule")}</p>
    </SectionCard>
  );
}

function licenseState(license: License, today: string): "active" | "ended" | "upcoming" {
  if (license.startsOn > today) return "upcoming";
  return license.endsOn > today ? "active" : "ended";
}

export function LicensesCard({ institution }: { institution: InstitutionDetail }) {
  const t = useTranslations("institutions.detail.licenses");
  const { isAdmin } = usePermissions();
  const [open, setOpen] = useState(false);
  const crm = institution.crm;
  if (!crm) return null;
  const today = todayIso();
  const canRenew = isAdmin && crm.status === "UCRETLI";
  return (
    <SectionCard
      icon={ShieldCheck}
      title={t("title")}
      action={
        canRenew ? (
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            <ShieldCheck />
            {t("renew")}
          </Button>
        ) : null
      }
    >
      {institution.licenses.length === 0 ? (
        <p className="text-sm text-muted-foreground">{crm.status === "DEMO" ? t("emptyDemo") : t("empty")}</p>
      ) : (
        <ul className="divide-y divide-border/60">
          {institution.licenses.map((l) => {
            const state = licenseState(l, today);
            return (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <span className="tabular-nums">
                  {formatDate(l.startsOn)} – {formatDate(l.endsOn)}
                </span>
                <span className="flex items-center gap-3">
                  <FinancialOnly>
                    <Money value={l.price} className="font-medium" />
                  </FinancialOnly>
                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                      state === "active" && "border-success/25 bg-success/10 text-success",
                      state === "upcoming" && "border-primary/25 bg-primary/10 text-primary",
                      state === "ended" && "border-border bg-muted text-muted-foreground"
                    )}
                  >
                    {t(`state.${state}`)}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 text-xs text-muted-foreground">{t("rule")}</p>
      {canRenew ? <RenewDialog institution={institution} open={open} onOpenChange={setOpen} /> : null}
    </SectionCard>
  );
}

/** Ödemeler (yalnız ADMIN). Fatura bilgisi eksikse ödeme düğmesi yerine uyarı çıkar (kural). */
export function PaymentsCard({
  institution,
  renderPaymentAction,
}: {
  institution: InstitutionDetail;
  /** Ödeme satırının sağ tarafına eklenen parça (ör. "Fatura kes" — faturalar modülü; route dosyası verir). */
  renderPaymentAction?: (payment: Payment, institution: InstitutionDetail) => React.ReactNode;
}) {
  const t = useTranslations("institutions.detail.payments");
  const tMethod = useTranslations("institutions.paymentMethod");
  const [open, setOpen] = useState(false);
  const crm = institution.crm;
  const payments = institution.payments;
  if (!crm || !payments) return null;
  const total = payments.reduce((sum, p) => sum + p.amount, 0);
  return (
    <SectionCard
      icon={Wallet}
      title={t("title")}
      action={
        <Button variant="outline" size="sm" onClick={() => setOpen(true)} disabled={!crm.billingComplete}>
          <Receipt />
          {t("record")}
        </Button>
      }
    >
      {!crm.billingComplete ? (
        <p className="mb-4 flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t("billingRequired")}
        </p>
      ) : null}
      {payments.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <>
          <ul className="divide-y divide-border/60">
            {payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <span>
                  <span className="tabular-nums">{formatDate(p.paidOn)}</span>
                  <span className="text-muted-foreground"> · {tMethod(p.method)}</span>
                  {p.note ? <span className="block text-xs text-muted-foreground">{p.note}</span> : null}
                </span>
                <span className="flex items-center gap-2">
                  {renderPaymentAction?.(p, institution)}
                  <Money value={p.amount} fractionDigits={2} className="font-medium" />
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex justify-between border-t border-border pt-3 text-sm font-semibold">
            {t("total")}
            <Money value={total} fractionDigits={2} />
          </p>
        </>
      )}
      {crm.billingComplete ? <PaymentDialog institution={institution} open={open} onOpenChange={setOpen} /> : null}
    </SectionCard>
  );
}

export function UsageCard({ institution }: { institution: InstitutionDetail }) {
  const t = useTranslations("institutions.detail.usage");
  const stats = [
    { label: t("students"), value: institution.usage.students },
    { label: t("teachers"), value: institution.usage.teachers },
    { label: t("classes"), value: institution.usage.classes },
  ];
  return (
    <SectionCard icon={UsersRound} title={t("title")}>
      <dl className="grid grid-cols-3 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-muted/30 p-3 text-center">
            <dd className="text-2xl font-bold tabular-nums">{s.value}</dd>
            <dt className="text-[11px] text-muted-foreground">{s.label}</dt>
          </div>
        ))}
      </dl>
      <p className="mt-5 mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("admins")}</p>
      {institution.admins.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noAdmins")}</p>
      ) : (
        <ul className="space-y-2">
          {institution.admins.map((a) => (
            <li key={a.userId} className="text-sm">
              <span className={cn("font-medium", !a.isActive && "text-muted-foreground line-through")}>{a.fullName ?? "—"}</span>
              {a.email ? <span className="block text-xs text-muted-foreground">{a.email}</span> : null}
            </li>
          ))}
        </ul>
      )}
      {institution.crm?.convertedAt ? (
        <p className="mt-4 text-xs text-muted-foreground">{t("convertedAt", { date: formatDateTime(institution.crm.convertedAt) })}</p>
      ) : null}
    </SectionCard>
  );
}
