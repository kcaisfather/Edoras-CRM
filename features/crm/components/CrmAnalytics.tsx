"use client";

import { useTranslations } from "next-intl";
import { PeriodPicker } from "@/components/period-picker";
import { FinancialOnly } from "@/features/auth";
import { useCrmAnalytics } from "../hooks";
import { CrmErrorState } from "./CrmErrorState";
import { CrmFunnelCard } from "./CrmFunnelCard";
import { CrmSalesBreakdowns } from "./CrmSalesBreakdowns";

/**
 * Satış Analizleri: seçili dönemde oluşturulan adayların satış hunisi (G82) ve satış kırılımları.
 * Sayılar finansal değildir (CRM_AGENT görür); satış kırılımları tutar içerdiği için yalnız finans yetkisiyle.
 */
export function CrmAnalytics() {
  const t = useTranslations("crm.analytics");
  const data = useCrmAnalytics();

  if (data.isError) return <CrmErrorState onRetry={data.refetch} />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <PeriodPicker defaultPeriod="all" allowAll />
        {!data.isLoading && <p className="text-xs text-muted-foreground">{t("cohort", { count: data.cohortSize })}</p>}
      </div>
      <CrmFunnelCard steps={data.funnel} isLoading={data.isLoading} />
      <FinancialOnly>
        <CrmSalesBreakdowns leads={data.cohort} />
      </FinancialOnly>
    </div>
  );
}
