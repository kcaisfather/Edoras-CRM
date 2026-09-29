"use client";

import { useTranslations } from "next-intl";
import { TrendingUp, DollarSign, CheckCircle, Users, Wallet } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/features/auth";
import { formatCurrency } from "@/lib/domain/crm/utils";
import type { CrmSummary } from "@/lib/domain/crm/types";

interface CrmSummaryCardsProps {
  summary: CrmSummary | null | undefined;
  isLoading?: boolean;
  /** G19 — Σ max(0, satış − tahsilat), seçili dönemdeki adaylar (statü / arama süzgecinden bağımsız). */
  openReceivables?: number;
  isOpenReceivablesLoading?: boolean;
}

export function CrmSummaryCards({
  summary,
  isLoading,
  openReceivables,
  isOpenReceivablesLoading,
}: CrmSummaryCardsProps) {
  const t = useTranslations("crm.summary");
  // EK-3: CRM_AGENT tutar kartlarını görmez; yalnız aday sayısı kalır (tutarlar sunucudan da boş gelir).
  const { canSeeFinancials } = usePermissions();

  const cards: {
    key: string;
    label: string;
    title?: string;
    value: string;
    loading?: boolean;
    icon: typeof Users;
    colorClass: string;
    bgClass: string;
    financial?: boolean;
  }[] = [
    {
      key: "totalOffer",
      financial: true,
      label: t("totalOffer"),
      value: formatCurrency(summary?.totalOffer ?? 0),
      icon: TrendingUp,
      colorClass: "text-primary",
      bgClass: "bg-primary/10",
    },
    {
      key: "totalSale",
      financial: true,
      label: t("totalSale"),
      value: formatCurrency(summary?.totalSale ?? 0),
      icon: DollarSign,
      colorClass: "text-success",
      bgClass: "bg-success/10",
    },
    {
      key: "totalCollected",
      financial: true,
      label: t("totalCollected"),
      value: formatCurrency(summary?.totalCollected ?? 0),
      icon: CheckCircle,
      colorClass: "text-success",
      bgClass: "bg-success/10",
    },
    {
      key: "openReceivables",
      financial: true,
      label: t("openReceivables"),
      title: t("openReceivablesHint"),
      value: formatCurrency(openReceivables ?? 0),
      loading: isOpenReceivablesLoading,
      icon: Wallet,
      colorClass: "text-warning",
      bgClass: "bg-warning/10",
    },
    {
      key: "count",
      label: t("count"),
      value: `${summary?.count ?? 0} / ${summary?.saleCount ?? 0}`,
      icon: Users,
      colorClass: "text-category-1",
      bgClass: "bg-category-1/10",
    },
  ];

  const visible = canSeeFinancials ? cards : cards.filter((c) => !c.financial);

  return (
    <div
      className={
        canSeeFinancials
          ? "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
          : "grid grid-cols-2 gap-3 sm:grid-cols-4"
      }
    >
      {visible.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.key}
            className="glass-panel flex items-center gap-3 rounded-2xl px-4 py-3"
            title={card.title}
          >
            <div className={`rounded-lg p-2 ${card.bgClass}`}>
              <Icon className={`h-4 w-4 ${card.colorClass}`} />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground truncate">{card.label}</p>
              {(card.loading ?? isLoading) ? (
                <Skeleton className="mt-1 h-4 w-16" />
              ) : (
                <p className="text-sm font-semibold tabular-nums">{card.value}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
