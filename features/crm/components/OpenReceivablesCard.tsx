"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, RotateCcw, Wallet } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { InfoTip } from "@/components/ui/info-tip";
import { Link } from "@/lib/navigation";
import { FinancialOnly } from "@/features/auth";
import { formatCurrency, getRemainingAmount } from "@/lib/domain/crm/utils";
import { useAllCrmLeads } from "../queries";

/** Tutar kartı — finansal yetkisi olmayan (CRM_AGENT) kullanıcıya hiç render edilmez, veri de çekilmez. */
export function OpenReceivablesCard() {
  return (
    <FinancialOnly>
      <OpenReceivablesCardInner />
    </FinancialOnly>
  );
}

/**
 * G19 — Açık alacak toplamı: Σ max(0, satış − tahsilat), tüm CRM adayları (tahsilat = bağlı kurumun ödemeleri).
 * Liste tek yerde: Adaylar → "Bakiyesi olanlar" görünümü (tahsilat ekleme, hatırlatma şablonu orada).
 */
function OpenReceivablesCardInner() {
  const t = useTranslations("crm.receivables");
  const tCommon = useTranslations("common");
  const { leads, isLoading, isError, refetch } = useAllCrmLeads();

  const { total, count } = useMemo(() => {
    let sum = 0;
    let n = 0;
    for (const lead of leads) {
      const remaining = getRemainingAmount(lead.saleAmount, lead.collectedAmount);
      if (remaining > 0) {
        sum += remaining;
        n++;
      }
    }
    return { total: sum, count: n };
  }, [leads]);

  return (
    <Card className="glass-panel rounded-2xl border-border/50 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-warning/20 bg-warning/10 p-2">
            <Wallet className="h-5 w-5 text-warning" />
          </div>
          <div>
            <p className="flex items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground">
              {t("title")}
              <InfoTip label={t("title")} align="start">
                {t("coverage")}
              </InfoTip>
            </p>
            {isLoading ? (
              <Skeleton className="mt-1 h-7 w-32" />
            ) : isError ? (
              // Hata kartı gizlemez: tutar yerine kısa mesaj + yeniden dene.
              <div role="alert" className="mt-1 flex flex-wrap items-center gap-2 text-sm text-destructive">
                <span>{tCommon("errors.fetchFailed")}</span>
                <Button variant="outline" size="sm" onClick={refetch}>
                  <RotateCcw />
                  {tCommon("retry")}
                </Button>
              </div>
            ) : (
              <p className="text-2xl font-bold tracking-tight">
                {formatCurrency(total)} <span className="text-sm font-normal text-muted-foreground">{t("customers", { count })}</span>
              </p>
            )}
          </div>
        </div>
        {!isError && count > 0 && (
          <Link href="/crm?tab=balance" className={buttonVariants({ variant: "outline", size: "sm" })}>
            {t("showList")}
            <ArrowRight />
          </Link>
        )}
      </div>
    </Card>
  );
}
