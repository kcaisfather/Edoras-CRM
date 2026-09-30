"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Activity, Building2, GraduationCap, School, UsersRound } from "lucide-react";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { CoverageNote } from "@/components/ui/coverage-note";
import { ListState } from "@/components/list";
import { FinancialOnly, usePermissions } from "@/features/auth";
import { useUrlParam } from "@/lib/hooks/use-url-param";
import { totalActivity, WINDOW_DAYS_OPTIONS } from "@/lib/domain/growth/usage";
import { useGrowthCustomers, useWindowDays } from "../queries";
import { LeakageView } from "./LeakageView";
import { RetentionView } from "./RetentionView";
import { UnitEconomicsView } from "./UnitEconomicsView";
import { UsageSection } from "./UsageSection";
import { StatCard, formatNumber } from "./shared";

const SECTIONS = ["leakage", "retention", "economics"] as const;
type Section = (typeof SECTIONS)[number];

/**
 * Müşteri Analizleri (/growth/analytics; DeepSport: kanal + dönem kontrolleri, Toplam Kullanıcı / Sporcu / Test kartları, "Kullanım"
 * bölümü ve altta Gelir sızıntısı / Retention & Churn / Birim ekonomisi). Burada: kurum / öğrenci / öğretmen / sınıf / etkinlik
 * kartları, açık "Kullanım" bölümü ve aynı üç alt bölüm. Kanal yok (tek ürün); dönem yerine sayı penceresi (7 / 30 / 90 gün).
 * Telemetri (DeepSport /analytics) Edoras'ta yok → taşınmadı.
 */
export function CustomerAnalyticsPage() {
  const t = useTranslations("growth.analytics");
  const { canSeeFinancials } = usePermissions();
  const [windowDays, setWindowDays] = useWindowDays();
  const query = useGrowthCustomers(windowDays);
  const customers = useMemo(() => query.data?.customers ?? [], [query.data]);
  const sections = SECTIONS.filter((s) => canSeeFinancials || s !== "economics");
  const [sectionParam, setSection] = useUrlParam("section", "leakage");
  const section: Section = (sections as readonly string[]).includes(sectionParam) ? (sectionParam as Section) : "leakage";

  const totals = useMemo(() => {
    let students = 0;
    let teachers = 0;
    let classes = 0;
    let activity = 0;
    for (const c of customers) {
      if (!c.usage) continue;
      students += c.usage.students;
      teachers += c.usage.teachers;
      classes += c.usage.classes;
      activity += totalActivity(c.usage.counts);
    }
    return { students, teachers, classes, activity };
  }, [customers]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <SegmentedControl<string>
          value={String(windowDays)}
          onValueChange={(v) => setWindowDays(Number(v))}
          aria-label={t("windowLabel")}
          options={WINDOW_DAYS_OPTIONS.map((d) => ({ value: String(d), label: t("windowOption", { days: d }) }))}
        />
      </div>

      <ListState isLoading={query.isLoading} isError={query.isError} onRetry={() => query.refetch()}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatCard label={t("kpi.institutions")} value={<span className="inline-flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" />{formatNumber(customers.length)}</span>} />
          <StatCard label={t("kpi.students")} value={<span className="inline-flex items-center gap-2"><GraduationCap className="h-4 w-4 text-category-3" />{formatNumber(totals.students)}</span>} />
          <StatCard label={t("kpi.teachers")} value={<span className="inline-flex items-center gap-2"><UsersRound className="h-4 w-4 text-caution" />{formatNumber(totals.teachers)}</span>} />
          <StatCard label={t("kpi.classes")} value={<span className="inline-flex items-center gap-2"><School className="h-4 w-4 text-success" />{formatNumber(totals.classes)}</span>} />
          <StatCard label={t("kpi.activity", { days: windowDays })} value={<span className="inline-flex items-center gap-2"><Activity className="h-4 w-4 text-primary" />{formatNumber(totals.activity)}</span>} />
        </div>
        <CoverageNote>{t("kpiNote")}</CoverageNote>

        <section aria-labelledby="usage-heading" className="space-y-4">
          <h2 id="usage-heading" className="text-base font-semibold">
            {t("usage")}
          </h2>
          <UsageSection customers={customers} windowDays={windowDays} />
        </section>

        <section className="space-y-4">
          <SegmentedControl<Section>
            value={section}
            onValueChange={setSection}
            aria-label={t("sectionsLabel")}
            options={sections.map((s) => ({ value: s, label: t(`sections.${s}`) }))}
          />
          {section === "leakage" && <LeakageView customers={customers} />}
          {section === "retention" && <RetentionView customers={customers} />}
          {section === "economics" && (
            <FinancialOnly>
              <UnitEconomicsView customers={customers} />
            </FinancialOnly>
          )}
        </section>
      </ListState>
    </div>
  );
}
