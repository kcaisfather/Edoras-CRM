"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { BadgeCheck, Building2, ClipboardPlus, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryErrorState } from "@/components/query-error-state";
import { usePermissions } from "@/features/auth";
import { apiErrorKind } from "@/lib/api/errors";
import { institutionStatus } from "@/lib/domain/institutions/status";
import { todayIso } from "@/lib/domain/institutions/rules";
import type { InstitutionDetail } from "@/lib/domain/institutions/types";
import { useInstitution } from "../queries";
import { formatDate, programLabel } from "../format";
import { InstitutionStatusBadge } from "./InstitutionStatusBadge";
import { BillingCard, ContactCard, DemoCard, LicensesCard, PaymentsCard, SectionCard, UsageCard } from "./detail-cards";
import { ConvertDialog } from "./dialogs";
import { EnrollDialog } from "./EnrollDialog";

export function InstitutionDetailPage({ id }: { id: string }) {
  const t = useTranslations("institutions.detail");
  const query = useInstitution(id);

  if (query.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-28 w-full rounded-2xl" />
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-64 rounded-2xl lg:col-span-2" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    );
  }
  if (query.isError) {
    if (apiErrorKind(query.error) === "notFound") {
      return <p className="rounded-2xl border border-border bg-card/60 p-6 text-sm text-muted-foreground">{t("notFound")}</p>;
    }
    return <QueryErrorState onRetry={() => query.refetch()} />;
  }
  if (!query.data) return null;
  const institution = query.data;

  return (
    <div className="space-y-6">
      <HeaderCard institution={institution} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {institution.crm ? <ContactCard institution={institution} /> : <UnregisteredCard />}
          <LicensesCard institution={institution} />
          <PaymentsCard institution={institution} />
        </div>
        <div className="space-y-6">
          <DemoCard institution={institution} />
          <BillingCard institution={institution} />
          <UsageCard institution={institution} />
        </div>
      </div>
    </div>
  );
}

function HeaderCard({ institution }: { institution: InstitutionDetail }) {
  const t = useTranslations("institutions.detail");
  const { isAdmin } = usePermissions();
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const info = institutionStatus(institution, todayIso());
  const isDemo = institution.crm?.status === "DEMO";

  return (
    <Card className="glass-panel rounded-2xl border-border/50 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Building2 className="h-6 w-6" />
          </div>
          <div className="min-w-0 space-y-1.5">
            <h1 className="text-2xl font-bold tracking-tight">{institution.name}</h1>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <InstitutionStatusBadge item={institution} />
              {institution.program ? (
                <span className="rounded border border-border px-1.5 font-semibold">{programLabel(institution.program)}</span>
              ) : null}
              {institution.createdAt ? <span>{t("createdAt", { date: formatDate(institution.createdAt) })}</span> : null}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!institution.crm && !institution.missingInEdoras ? (
            <Button onClick={() => setEnrollOpen(true)}>
              <ClipboardPlus />
              {t("enroll")}
            </Button>
          ) : null}
          {isDemo && isAdmin ? (
            <Button onClick={() => setConvertOpen(true)}>
              <BadgeCheck />
              {t("convert")}
            </Button>
          ) : null}
        </div>
      </div>
      {info.state === "EDORAS_YOK" ? (
        <p className="mt-4 flex items-start gap-2 text-xs text-warning">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t("missingNote")}
        </p>
      ) : null}
      {info.state === "PASIF" ? (
        <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t("inactiveNote")}
        </p>
      ) : null}
      {isDemo && !isAdmin ? (
        <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t("convertAdminOnly")}
        </p>
      ) : null}
      <EnrollDialog institution={institution} open={enrollOpen} onOpenChange={setEnrollOpen} />
      {isDemo && isAdmin ? <ConvertDialog institution={institution} open={convertOpen} onOpenChange={setConvertOpen} /> : null}
    </Card>
  );
}

function UnregisteredCard() {
  const t = useTranslations("institutions.detail.unregistered");
  return (
    <SectionCard icon={ClipboardPlus} title={t("title")}>
      <p className="text-sm text-muted-foreground">{t("description")}</p>
    </SectionCard>
  );
}
