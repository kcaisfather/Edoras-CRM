"use client";

import { useTranslations } from "next-intl";
import { Activity } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/features/institutions";
import { DEFAULT_WINDOW_DAYS, USING_DAYS, daysSinceActivity, isUsing, totalActivity } from "@/lib/domain/growth/usage";
import { ACTIVITY_SOURCES } from "@/lib/domain/growth/types";
import { useInstitutionUsage } from "../queries";
import { formatNumber } from "./shared";

/**
 * Kurum ayrıntısındaki "Kullanım" kartı (aside): son 30 günün etkinliği ve son etkinlik günü. Öğrenci/öğretmen/sınıf sayıları
 * zaten "Edoras kullanımı" kartında — burada yalnız etkinlik. Veri Edoras'tan salt okunur (5 dk önbellekli).
 */
export function InstitutionUsageCard({ institutionId }: { institutionId: string }) {
  const t = useTranslations("growth.usageCard");
  const ts = useTranslations("growth.sources");
  const query = useInstitutionUsage(institutionId, DEFAULT_WINDOW_DAYS);
  const usage = query.data;

  return (
    <Card className="glass-panel rounded-2xl border-border/50 p-6">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-bold leading-tight">
        <Activity className="h-5 w-5 text-primary" />
        {t("title")}
      </h2>
      {query.isLoading ? (
        <Skeleton className="h-24 w-full rounded-xl" />
      ) : query.isError || !usage ? (
        <p className="text-sm text-muted-foreground">{t("unavailable")}</p>
      ) : (
        <div className="space-y-4">
          <dl className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border bg-muted/30 p-3 text-center">
              <dd className="text-2xl font-bold tabular-nums">{formatNumber(totalActivity(usage.counts))}</dd>
              <dt className="text-[11px] text-muted-foreground">{t("activity", { days: usage.windowDays })}</dt>
            </div>
            <div className="rounded-xl border border-border bg-muted/30 p-3 text-center">
              <dd className="text-lg font-bold leading-8">
                {usage.lastActivityOn ? formatDate(usage.lastActivityOn) : <span className="text-muted-foreground">{t("never")}</span>}
              </dd>
              <dt className="text-[11px] text-muted-foreground">
                {usage.lastActivityOn ? t("lastActivityDays", { days: daysSinceActivity(usage) ?? 0 }) : t("lastActivity")}
              </dt>
            </div>
          </dl>
          <p className={isUsing(usage) ? "text-sm text-success" : "text-sm text-muted-foreground"}>
            {isUsing(usage) ? t("using", { days: USING_DAYS }) : t("notUsing", { days: USING_DAYS })}
          </p>
          <ul className="divide-y divide-border/60 text-sm">
            {ACTIVITY_SOURCES.map((s) => (
              <li key={s} className="flex items-center justify-between gap-2 py-1.5">
                <span className="text-muted-foreground">
                  {ts(s)}
                  {usage.unavailable.includes(s) ? <span className="ml-2 text-xs text-warning">{t("sourceUnavailable")}</span> : null}
                </span>
                <span className="text-right tabular-nums">
                  {usage.counts[s]}
                  <span className="ml-2 text-xs text-muted-foreground">{usage.lastDates[s] ? formatDate(usage.lastDates[s]) : "—"}</span>
                </span>
              </li>
            ))}
          </ul>
          {usage.activeTeachers != null ? (
            <p className="text-xs text-muted-foreground">
              {t("activeTeachers", {
                active: `${usage.activeTeachersLowerBound ? "≥" : ""}${usage.activeTeachers}`,
                total: usage.teachers,
                days: usage.windowDays,
              })}
            </p>
          ) : null}
        </div>
      )}
    </Card>
  );
}
