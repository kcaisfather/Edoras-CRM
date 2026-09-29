"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { AlarmClock, BadgeCheck, Building2, FlaskConical, ShieldAlert } from "lucide-react";
import { Link } from "@/lib/navigation";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryErrorState } from "@/components/query-error-state";
import { useCurrentUser } from "@/features/auth";
import { InstitutionStatusBadge, useInstitutions } from "@/features/institutions";
import { cn } from "@/lib/utils";
import { todayIso } from "@/lib/domain/institutions/rules";
import {
  institutionStatus,
  statusPriority,
  type InstitutionFilter,
  type InstitutionStatusInfo,
} from "@/lib/domain/institutions/status";
import type { InstitutionListItem } from "@/lib/domain/institutions/types";

interface Row {
  item: InstitutionListItem;
  info: InstitutionStatusInfo;
}

/** Ana sayfa: kurum sayıları ve aksiyon bekleyenler (demosu biten, lisansı biten/yaklaşan). */
export function Dashboard() {
  const t = useTranslations("dashboard");
  const { data: user } = useCurrentUser();
  const query = useInstitutions();
  const today = todayIso();

  const rows = useMemo<Row[]>(
    () => (query.data ?? []).map((item) => ({ item, info: institutionStatus(item, today) })),
    [query.data, today]
  );
  const count = (predicate: (r: Row) => boolean) => rows.filter(predicate).length;
  const actionable = useMemo(
    () =>
      rows
        .filter((r) => r.info.state === "DEMO_BITTI" || r.info.state === "LISANS_BITTI" || r.info.licenseSoon)
        .sort((a, b) => statusPriority(a.info) - statusPriority(b.info) || (a.info.daysLeft ?? 0) - (b.info.daysLeft ?? 0)),
    [rows]
  );

  if (query.isError) return <QueryErrorState onRetry={() => query.refetch()} />;

  const kpis: { key: string; label: string; value: number; icon: React.ComponentType<{ className?: string }>; filter: InstitutionFilter; tone: string }[] = [
    { key: "all", label: t("kpi.all"), value: rows.length, icon: Building2, filter: "all", tone: "text-foreground" },
    { key: "paid", label: t("kpi.paid"), value: count((r) => r.info.state === "UCRETLI"), icon: BadgeCheck, filter: "paid", tone: "text-success" },
    { key: "demo", label: t("kpi.demo"), value: count((r) => r.info.state === "DEMO"), icon: FlaskConical, filter: "demo", tone: "text-primary" },
    { key: "demoExpired", label: t("kpi.demoExpired"), value: count((r) => r.info.state === "DEMO_BITTI"), icon: AlarmClock, filter: "demoExpired", tone: "text-warning" },
    { key: "license", label: t("kpi.license"), value: count((r) => r.info.state === "LISANS_BITTI" || r.info.licenseSoon), icon: ShieldAlert, filter: "licenseSoon", tone: "text-caution" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {user?.fullName ? t("greeting", { name: user.fullName.split(" ")[0] }) : t("title")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        {kpis.map((k) => (
          <Link
            key={k.key}
            href={k.filter === "all" ? "/institutions" : `/institutions?filter=${k.filter}`}
            className="dashboard-card group block p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            <k.icon className={cn("h-5 w-5", k.tone)} />
            {query.isLoading ? (
              <Skeleton className="mt-3 h-8 w-12" />
            ) : (
              <p className="mt-3 text-3xl font-bold tabular-nums">{k.value}</p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">{k.label}</p>
          </Link>
        ))}
      </div>

      <Card className="glass-panel rounded-2xl border-border/50 p-6">
        <h2 className="mb-1 text-lg font-bold">{t("actionable.title")}</h2>
        <p className="mb-4 text-xs text-muted-foreground">{t("actionable.description")}</p>
        {query.isLoading ? (
          <Skeleton className="h-24 w-full rounded-xl" />
        ) : actionable.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("actionable.empty")}</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {actionable.map(({ item }) => (
              <li key={item.id}>
                <Link
                  href={`/institutions/${item.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-2.5 text-sm hover:bg-accent/60"
                >
                  <span className="min-w-0">
                    <span className="font-medium">{item.name}</span>
                    {item.crm ? <span className="block text-xs text-muted-foreground">{item.crm.contactName}</span> : null}
                  </span>
                  <InstitutionStatusBadge item={item} today={today} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
