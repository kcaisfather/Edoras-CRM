"use client";

import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryErrorState } from "@/components/query-error-state";
import { FinancialOnly } from "@/features/auth";
import { cn } from "@/lib/utils";
import { collectionsTotal } from "@/lib/domain/crm/collections";
import type { CrmLead } from "@/lib/domain/crm/types";
import { formatCrmDate, formatCurrency } from "@/lib/domain/crm/utils";
import { useLeadCollections } from "../queries";

/**
 * Adayın tahsilat geçmişi (yeniden eskiye) = bağlı kurumun ödemeleri: tarih, yöntem, tutar, not, giren.
 * Tutar yetkisi yoksa hiçbir şey çizmez (uç da CRM_AGENT'a 403 döner).
 */
export function CrmCollectionHistory({ lead, className }: { lead: CrmLead; className?: string }) {
  return (
    <FinancialOnly>
      <HistoryInner lead={lead} className={className} />
    </FinancialOnly>
  );
}

function HistoryInner({ lead, className }: { lead: CrmLead; className?: string }) {
  const t = useTranslations("crm.collections");
  const tMethod = useTranslations("institutions.paymentMethod");
  const { data: items = [], isLoading, isError, refetch } = useLeadCollections(lead);

  return (
    <section className={cn("space-y-2", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold">{t("historyTitle")}</h4>
        {items.length > 0 && (
          <span className="text-xs tabular-nums text-muted-foreground">{t("historyTotal", { amount: formatCurrency(collectionsTotal(items)) })}</span>
        )}
      </div>
      {!lead.institutionId ? (
        <p className="text-xs text-muted-foreground">{t("historyNotLinked")}</p>
      ) : isLoading ? (
        <Skeleton className="h-12 w-full rounded-lg" />
      ) : isError ? (
        <QueryErrorState onRetry={() => void refetch()} />
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("historyEmpty")}</p>
      ) : (
        <ul className="divide-y divide-border/60 rounded-lg border border-border/60 text-sm">
          {items.map((c) => (
            <li key={c.id} className="flex items-start justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <p className="tabular-nums">
                  {formatCrmDate(c.date)} <span className="text-muted-foreground">· {tMethod(c.method)}</span>
                </p>
                {c.note && (
                  <p className="truncate text-xs text-muted-foreground" title={c.note}>
                    {c.note}
                  </p>
                )}
                {c.actorName && <p className="text-xs text-muted-foreground">{c.actorName}</p>}
              </div>
              <span className="shrink-0 font-medium tabular-nums">{formatCurrency(c.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
