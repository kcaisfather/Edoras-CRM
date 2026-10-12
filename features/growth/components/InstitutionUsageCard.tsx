"use client";

import { useTranslations } from "next-intl";
import { Activity, Clock, History } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/features/auth";
import { StatTile, StatTileSkeleton, formatDate } from "@/features/institutions";
import { Link } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { inactivityTone } from "@/lib/utils/customer-signals";
import { daysBetween, todayIso } from "@/lib/domain/institutions/rules";
import { DEFAULT_WINDOW_DAYS, USING_DAYS, daysSinceActivity, isUsing, totalActivity } from "@/lib/domain/growth/usage";
import { ACTIVITY_SOURCES } from "@/lib/domain/growth/types";
import { useInstitutionUsage } from "../queries";
import { TONE_DOT, formatNumber } from "./shared";

/**
 * Kurum ayrıntısı başlığındaki iki gösterge kutucuğu: son 30 günün toplam etkinliği (+ Kullanıyor / Kullanmıyor) ve son
 * etkinlik (renk noktası müşteri listesindekiyle aynı eşikler). Özellik kullanımı kartıyla aynı sorgu — React Query tek istek atar.
 */
export function InstitutionActivityHighlights({ institutionId }: { institutionId: string }) {
  const t = useTranslations("growth.usageCard");
  const tc = useTranslations("growth.common");
  const query = useInstitutionUsage(institutionId, DEFAULT_WINDOW_DAYS);
  const usage = query.data;

  if (query.isLoading) {
    return (
      <>
        <StatTileSkeleton />
        <StatTileSkeleton />
      </>
    );
  }
  if (query.isError || !usage) return <StatTile icon={Activity} label={t("tileActivity")} value="—" hint={t("unavailable")} />;

  const days = daysSinceActivity(usage);
  const using = isUsing(usage);
  return (
    <>
      <StatTile
        icon={Activity}
        label={t("tileActivity")}
        value={formatNumber(totalActivity(usage.counts))}
        title={t(using ? "using" : "notUsing", { days: USING_DAYS })}
        hint={
          <>
            {t("tileWindow", { days: usage.windowDays })} ·{" "}
            <span className={using ? "font-medium text-success" : undefined}>{using ? tc("using") : tc("notUsing")}</span>
          </>
        }
      />
      <StatTile
        icon={Clock}
        label={t("lastActivity")}
        value={
          <span className="inline-flex items-center gap-2">
            <span aria-hidden className={cn("h-2.5 w-2.5 shrink-0 rounded-full", TONE_DOT[inactivityTone(days)])} />
            {days == null ? tc("never") : days <= 0 ? tc("today") : tc("daysAgo", { days })}
          </span>
        }
        hint={usage.lastActivityOn ? formatDate(usage.lastActivityOn) : undefined}
      />
    </>
  );
}

/**
 * Kurum ayrıntısındaki "Özellik kullanımı" kartı: kaynak başına son 30 günün kayıt sayısı ve son kullanım günü (nokta:
 * son kullanımdan bu yana geçen süre). Toplam ve son etkinlik başlıktaki kutucuklarda; öğrenci/öğretmen/sınıf sayıları da
 * başlıkta. Yöneticiye kurumun etkinlik geçmişine bağlantı. Veri Edoras'tan salt okunur (5 dk önbellekli).
 */
export function InstitutionUsageCard({ institutionId }: { institutionId: string }) {
  const t = useTranslations("growth.usageCard");
  const ts = useTranslations("growth.sources");
  const tc = useTranslations("growth.common");
  const { isAdmin } = usePermissions();
  const query = useInstitutionUsage(institutionId, DEFAULT_WINDOW_DAYS);
  const usage = query.data;
  const today = todayIso();

  return (
    <Card className="glass-panel rounded-2xl border-border/50 p-6">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-bold leading-tight">
          <Activity className="h-5 w-5 text-primary" />
          {t("title")}
        </h2>
        {isAdmin ? (
          <Link href={`/activity-history?inst=${institutionId}`} className={buttonVariants({ size: "sm", variant: "ghost" })}>
            <History />
            {t("history")}
          </Link>
        ) : null}
      </div>
      <p className="mb-4 text-xs text-muted-foreground">{t("subtitle", { days: usage?.windowDays ?? DEFAULT_WINDOW_DAYS })}</p>
      {query.isLoading ? (
        <Skeleton className="h-48 w-full rounded-xl" />
      ) : query.isError || !usage ? (
        <p className="text-sm text-muted-foreground">{t("unavailable")}</p>
      ) : (
        <div className="space-y-4">
          <ul className="-mx-2 space-y-0.5 text-sm">
            {ACTIVITY_SOURCES.map((s) => {
              const last = usage.lastDates[s];
              const since = last ? daysBetween(last.slice(0, 10), today) : null;
              const count = usage.counts[s];
              return (
                <li key={s} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/40">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span
                      aria-hidden
                      className={cn("h-2 w-2 shrink-0 rounded-full", TONE_DOT[inactivityTone(since)])}
                      title={since == null ? tc("never") : since <= 0 ? tc("today") : tc("daysAgo", { days: since })}
                    />
                    <span className={cn("truncate", count === 0 && "text-muted-foreground")}>{ts(s)}</span>
                    {usage.unavailable.includes(s) ? <span className="text-xs text-warning">{t("sourceUnavailable")}</span> : null}
                  </span>
                  <span className="shrink-0 text-right leading-tight">
                    <span className={cn("block font-semibold tabular-nums", count === 0 && "font-normal text-muted-foreground")}>
                      {formatNumber(count)}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">{last ? formatDate(last) : t("unused")}</span>
                  </span>
                </li>
              );
            })}
          </ul>
          {usage.activeTeachers != null ? (
            <p className="border-t border-border/60 pt-3 text-xs text-muted-foreground">
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
