"use client";

import { useTranslations } from "next-intl";
import { Lock } from "lucide-react";
import { Link } from "@/lib/navigation";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/features/auth";

/**
 * Faturalar (/sales/invoices) ve Ödeme Geçmişi (/payment-history) sayfalarının kapısı: tutar görme yetkisi (ADMIN)
 * yoksa içerik çizilmez ve hiçbir tutar isteği atılmaz. Yönlendirme rota korumasındadır (lib/permissions.ts); bu ikinci
 * savunma hattıdır. Asıl koruma sunucuda: uçlar CRM_AGENT'a 403 döner.
 */
export function SalesAccessGate({ children }: { children: React.ReactNode }) {
  const t = useTranslations("sales.access");
  const { isLoading, canSeeFinancials } = usePermissions();
  if (isLoading) return <Skeleton className="h-64 w-full rounded-2xl" />;
  if (!canSeeFinancials) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
        <Lock className="h-8 w-8 text-muted-foreground" aria-hidden />
        <h1 className="text-lg font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("body")}</p>
        <Link href="/crm" className={buttonVariants({ variant: "outline" })}>
          {t("toCrm")}
        </Link>
      </div>
    );
  }
  return <>{children}</>;
}
