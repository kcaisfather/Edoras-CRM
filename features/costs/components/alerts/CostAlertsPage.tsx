"use client";

import { useTranslations } from "next-intl";
import { CheckCircle2, Info } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCostAlerts } from "../../queries";
import { AlertTypeBadge, SeverityBadge, ServiceLabel } from "../shared/Badges";
import { CostEmptyState, CostErrorState, CostPanel, CostRowsSkeleton } from "../shared/CostStates";
import { formatLiraExact, formatMonth } from "../shared/format";
import { AlertText } from "./AlertText";

/**
 * Maliyetler → Uyarılar (DeepSport CostAlertsPage). DeepSport'ta uyarıları bir zamanlayıcı üretip saklıyordu (onayla / çöz / anomali
 * tara); burada hiçbir şey saklanmaz: liste her açılışta bütçelerden ve defterden HESAPLANIR, koşul ortadan kalkınca uyarı da
 * kalkar. Onay / çözüm düğmesi ve geçmiş sekmesi bu yüzden yok.
 */
export function CostAlertsPage() {
  const t = useTranslations("costs.alerts");
  const alertsQ = useCostAlerts();
  const items = alertsQ.data?.items ?? [];

  return (
    <div className="space-y-6">
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {alertsQ.data ? t("computedNote", { month: formatMonth(alertsQ.data.month) }) : t("computedNoteShort")}
      </p>
      <CostPanel orb="vision-card-orb-pink">
        {alertsQ.isLoading ? (
          <CostRowsSkeleton rows={4} />
        ) : alertsQ.isError ? (
          <CostErrorState onRetry={() => void alertsQ.refetch()} />
        ) : items.length === 0 ? (
          <CostEmptyState message={t("empty")} icon={CheckCircle2} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("tableType")}</TableHead>
                <TableHead>{t("tableSeverity")}</TableHead>
                <TableHead>{t("tableMessage")}</TableHead>
                <TableHead>{t("tableService")}</TableHead>
                <TableHead className="text-right">{t("tableCurrent")}</TableHead>
                <TableHead className="text-right">{t("tableThreshold")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <AlertTypeBadge type={a.type} />
                  </TableCell>
                  <TableCell>
                    <SeverityBadge severity={a.severity} />
                  </TableCell>
                  <TableCell className="max-w-md text-sm text-foreground">
                    <AlertText alert={a} />
                  </TableCell>
                  <TableCell>{a.service ? <ServiceLabel service={a.service} /> : <span className="text-xs text-muted-foreground">{t("allServices")}</span>}</TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums">{formatLiraExact(a.currentTry)}</TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">{a.thresholdTry === null ? "—" : formatLiraExact(a.thresholdTry)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CostPanel>
    </div>
  );
}
