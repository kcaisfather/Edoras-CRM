"use client";

import { useTranslations } from "next-intl";
import { Lock } from "lucide-react";
import { Link } from "@/lib/navigation";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/features/auth";

/**
 * Maliyet bölümü yetki kapısı (DeepSport CostsAccessGuard): maliyet finansal veridir — yalnız ADMIN. Yol CRM_AGENT_PATHS'te
 * değildir (rota koruması yönlendirir); bu ikinci savunma hattı, uçlar da CRM_AGENT'a 403 döner. Yetkisiz kullanıcı için hiçbir
 * maliyet isteği atılmaz (sorgular `isAdmin` ile açılır).
 */
export function CostsAccessGuard({ children }: { children: React.ReactNode }) {
  const t = useTranslations("costs.guard");
  const { isLoading, isAdmin, homePath } = usePermissions();

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[1800px] space-y-6 px-6 pb-8 pt-6 md:px-8">
        <Skeleton className="h-12 w-2/3 rounded-2xl" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-3xl" />
          ))}
        </div>
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
        <Lock className="h-8 w-8 text-muted-foreground" aria-hidden />
        <h1 className="text-lg font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("adminRequired")}</p>
        <Link href={homePath} className={buttonVariants({ variant: "outline" })}>
          {t("back")}
        </Link>
      </div>
    );
  }
  return <>{children}</>;
}
