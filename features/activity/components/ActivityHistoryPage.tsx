"use client";

import { useTranslations } from "next-intl";
import { Lock } from "lucide-react";
import { Link, useRouter } from "@/lib/navigation";
import { useSearchParams } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/features/auth";
import { AuditLogsList } from "./AuditLogsList";
import { InstitutionEventsList } from "./InstitutionEventsList";

const SCOPES = ["events", "audit"] as const;
type Scope = (typeof SCOPES)[number];

/**
 * Aktivite geçmişi (DeepSport /activity-history). DeepSport'ta liste tek kapsamlıydı (kullanıcı / sporcu anahtarı); burada iki
 * kapsam düğmesi var: "Kurum etkinliği" (Edoras kurumlarının öğretmen / yönetici etkinlikleri, salt okunur) ve "CRM işlem
 * kaydı" (personelin CRM'de yaptığı yazma işlemleri). Yalnız ADMIN: yol CRM_AGENT_PATHS'te değil, uçlar 403 döner; bu kapı ikinci
 * savunma hattı. Kapsam URL'de (?scope=audit); değişince süzgeçler sıfırlanır.
 */
export function ActivityHistoryPage() {
  const t = useTranslations("activityHistory");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoading, isAdmin, homePath } = usePermissions();
  const scope: Scope = searchParams.get("scope") === "audit" ? "audit" : "events";

  if (isLoading) return <Skeleton className="h-64 w-full rounded-2xl" />;
  if (!isAdmin) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
        <Lock className="h-8 w-8 text-muted-foreground" aria-hidden />
        <h1 className="text-lg font-semibold">{t("access.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("access.body")}</p>
        <Link href={homePath} className={buttonVariants({ variant: "outline" })}>
          {t("access.back")}
        </Link>
      </div>
    );
  }

  const select = (next: Scope) => router.replace(next === "audit" ? "?scope=audit" : "?", { scroll: false });

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <span id="activity-scope-label" className="text-sm text-muted-foreground">
          {t("filters.scope.label")}
        </span>
        <div role="group" aria-labelledby="activity-scope-label" className="flex items-center gap-1.5">
          {SCOPES.map((s) => (
            <Button key={s} size="sm" variant={scope === s ? "default" : "outline"} aria-pressed={scope === s} onClick={() => select(s)}>
              {t(`filters.scope.${s}`)}
            </Button>
          ))}
        </div>
      </div>
      {scope === "events" ? <InstitutionEventsList /> : <AuditLogsList />}
    </div>
  );
}
