"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ChevronRight, Info, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApiErrorMessage } from "@/lib/hooks/use-api-error-message";
import { parseDecimal } from "@/lib/domain/costs/schemas";
import { useCostEntries, useCostServices, useCostSettings, useSmsEstimate } from "../../queries";
import { useUpdateCostSettings } from "../../mutations";
import { CostEmptyState, CostErrorState, CostPanel, CostRowsSkeleton } from "../shared/CostStates";
import { ServiceLabel } from "../shared/Badges";
import { MonthPicker, useMonthParam } from "../shared/MonthPicker";
import { SERVICE_COLORS, formatLira, formatLiraExact, formatMonth, formatMonthShort, formatNumber, formatPct } from "../shared/format";
import { TrendBars, ShareBar } from "../charts/Charts";
import { CLICKABLE_ROW_CLASS, clickableRowProps } from "../shared/clickableRow";
import type { CostService, ServicesMatrix } from "@/lib/domain/costs/types";

/**
 * Maliyetler → Hizmetler (DeepSport CostServicesPage): hizmet × ay tablosu (seçilen ay ile biten son 12 ay), satıra tıklayınca
 * hizmetin eğilimi ve defter satırları. Altında Edoras sms_logs'tan TAHMİNİ SMS maliyeti ve SMS birim fiyatı ayarı.
 */
export function CostServicesPage() {
  const t = useTranslations("costs.services");
  const [month, setMonth] = useMonthParam();
  const [selected, setSelected] = useState<CostService | null>(null);
  const servicesQ = useCostServices(month);
  const matrix = servicesQ.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthPicker value={month} onChange={setMonth} />
        <p className="text-xs text-muted-foreground">{t("windowNote", { month: formatMonth(month) })}</p>
      </div>

      <CostPanel title={t("title")}>
        {servicesQ.isLoading && !matrix ? (
          <CostRowsSkeleton rows={5} />
        ) : servicesQ.isError && !matrix ? (
          <CostErrorState onRetry={() => void servicesQ.refetch()} />
        ) : !matrix || matrix.rows.length === 0 ? (
          <CostEmptyState message={t("empty")} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 bg-card">{t("tableServiceName")}</TableHead>
                {matrix.months.map((m) => (
                  <TableHead key={m} className="whitespace-nowrap text-right">
                    {formatMonthShort(m)}
                  </TableHead>
                ))}
                <TableHead className="text-right">{t("tableTotal")}</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {matrix.rows.map((row) => (
                <TableRow key={row.service} {...clickableRowProps(() => setSelected(row.service))} className={CLICKABLE_ROW_CLASS} aria-label={t("openDetail", { service: t(`names.${row.service}`) })}>
                  <TableCell className="sticky left-0 bg-card font-medium text-foreground">
                    <ServiceLabel service={row.service} />
                  </TableCell>
                  {row.byMonth.map((v, i) => (
                    <TableCell key={matrix.months[i]} className={`text-right font-mono text-xs ${v > 0 ? "" : "text-muted-foreground"}`}>
                      {v > 0 ? formatLira(v) : "—"}
                    </TableCell>
                  ))}
                  <TableCell className="text-right font-mono font-medium">{formatLira(row.totalTry)}</TableCell>
                  <TableCell>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="border-t-2 bg-muted/30 font-semibold hover:bg-muted/30">
                <TableCell className="sticky left-0 bg-muted/30">{t("tableTotal")}</TableCell>
                {matrix.totalsByMonth.map((v, i) => (
                  <TableCell key={matrix.months[i]} className="text-right font-mono text-xs">
                    {v > 0 ? formatLira(v) : "—"}
                  </TableCell>
                ))}
                <TableCell className="text-right font-mono">{formatLira(matrix.grandTotalTry)}</TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        )}
        {matrix && matrix.rows.length > 0 ? (
          <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
            {matrix.rows.map((r) => (
              <li key={r.service} className="flex items-center gap-2">
                <ServiceLabel service={r.service} />
                <ShareBar pct={matrix.grandTotalTry > 0 ? (r.totalTry / matrix.grandTotalTry) * 100 : 0} color={SERVICE_COLORS[r.service]} />
                <span className="font-mono tabular-nums">{formatPct(matrix.grandTotalTry > 0 ? (r.totalTry / matrix.grandTotalTry) * 100 : 0, 1)}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </CostPanel>

      <SmsEstimatePanel month={month} />

      <ServiceDetailSheet service={selected} month={month} matrix={matrix} onClose={() => setSelected(null)} />
    </div>
  );
}

/** Edoras sms_logs tahmini ↔ defter, ve birim fiyat ayarı (TL / alıcı). Edoras'a yazılmaz; tahmin deftere de yazılmaz. */
function SmsEstimatePanel({ month }: { month: string }) {
  const t = useTranslations("costs.services.sms");
  const tErrors = useTranslations("costs.errors");
  const errorText = useApiErrorMessage();
  const smsQ = useSmsEstimate(month);
  const settingsQ = useCostSettings();
  const update = useUpdateCostSettings();
  const [draft, setDraft] = useState<string | null>(null);

  const stored = settingsQ.data?.smsUnitPriceTry;
  const value = draft ?? (stored !== undefined ? String(stored).replace(".", ",") : "");
  const parsed = parseDecimal(value, 4);
  const invalid = draft !== null && (parsed === null || parsed >= 1000);
  const sms = smsQ.data;

  const save = () => {
    if (parsed === null || parsed >= 1000) return;
    update.mutate(
      { smsUnitPriceTry: parsed },
      {
        onSuccess: () => {
          toast.success(t("saved"));
          setDraft(null);
        },
        onError: (e) => toast.error(errorText(e, tErrors("mutationFailed"))),
      }
    );
  };

  return (
    <CostPanel orb="vision-card-orb-indigo" title={t("title", { month: formatMonth(month) })} description={t("description")}>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          {smsQ.isLoading ? (
            <Skeleton className="h-24 w-full rounded-xl" />
          ) : smsQ.isError ? (
            <CostErrorState onRetry={() => void smsQ.refetch()} />
          ) : sms && !sms.available ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Info className="h-4 w-4 shrink-0" />
              {t("unavailable")}
            </p>
          ) : sms ? (
            <dl className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{t("recipients")}</dt>
                <dd className="mt-1 text-xl font-light">{formatNumber(sms.recipients)}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{t("estimated")}</dt>
                <dd className="mt-1 text-xl font-light">{sms.unitPriceTry > 0 ? formatLiraExact(sms.estimatedTry) : "—"}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{t("ledger")}</dt>
                <dd className="mt-1 text-xl font-light">{sms.ledgerTry > 0 ? formatLiraExact(sms.ledgerTry) : "—"}</dd>
              </div>
            </dl>
          ) : null}
          {sms?.available && sms.ledgerTry > 0 && sms.unitPriceTry > 0 ? (
            <p className="text-xs text-muted-foreground">
              {t("delta", { delta: formatLiraExact(sms.ledgerTry - sms.estimatedTry) })}
            </p>
          ) : null}
          {sms?.truncated ? <p className="text-xs text-muted-foreground">{t("truncated")}</p> : null}
          <p className="text-xs text-muted-foreground">{t("note")}</p>
        </div>

        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <label htmlFor="sms-unit-price" className="text-sm font-medium">
            {t("unitPrice")}
          </label>
          <div className="flex items-center gap-2">
            <Input
              id="sms-unit-price"
              inputMode="decimal"
              value={value}
              aria-invalid={invalid}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="0,0875"
              className="max-w-40"
            />
            <Button type="submit" size="sm" disabled={update.isPending || draft === null || invalid}>
              {update.isPending ? <Loader2 className="animate-spin" /> : <Save />}
              {t("save")}
            </Button>
          </div>
          {invalid ? <p className="text-xs text-destructive">{t("invalidPrice")}</p> : <p className="text-xs text-muted-foreground">{t("unitPriceHelp")}</p>}
        </form>
      </div>
    </CostPanel>
  );
}

function ServiceDetailSheet({ service, month, matrix, onClose }: { service: CostService | null; month: string; matrix: ServicesMatrix | undefined; onClose: () => void }) {
  const t = useTranslations("costs.services");
  const firstMonth = matrix?.months[0] ?? month;
  const entriesQ = useCostEntries({ service: service ?? "", from: firstMonth, to: month, page: 0, size: 50 }, !!service);
  const row = matrix?.rows.find((r) => r.service === service);
  const trend = matrix && row ? matrix.months.map((m, i) => ({ month: m, totalTry: row.byMonth[i], byService: { [row.service]: row.byMonth[i] } })) : [];

  return (
    <Sheet open={!!service} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto border-l sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="text-lg">{t("detailTitle")}</SheetTitle>
          <SheetDescription>{service ? t(`names.${service}`) : ""}</SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-6 px-4 pb-6">
          <div>
            <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">{t("detailTrend")}</h4>
            <div className="glass-panel rounded-2xl p-3">{service && trend.length > 0 ? <TrendBars points={trend} services={[service]} /> : <Skeleton className="h-40 w-full" />}</div>
          </div>
          <div>
            <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">{t("detailEntries")}</h4>
            {entriesQ.isLoading ? (
              <Skeleton className="h-32 w-full rounded-2xl" />
            ) : entriesQ.isError ? (
              <CostErrorState onRetry={() => void entriesQ.refetch()} />
            ) : !entriesQ.data || entriesQ.data.items.length === 0 ? (
              <CostEmptyState />
            ) : (
              <div className="glass-panel space-y-1 rounded-2xl p-3">
                {entriesQ.data.items.map((e) => (
                  <div key={e.id} className="flex items-center justify-between rounded-lg p-2 text-xs hover:bg-muted/50">
                    <span className="min-w-0 truncate text-foreground">
                      <span className="text-muted-foreground">{formatMonthShort(e.month)}</span> {e.note ?? ""}
                    </span>
                    <span className="ml-3 shrink-0 text-right font-mono">
                      {formatLiraExact(e.amountTry)}
                      {e.currency === "USD" ? <span className="block text-[10px] text-muted-foreground">{`$${e.amount} × ${e.fxRate}`}</span> : null}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
