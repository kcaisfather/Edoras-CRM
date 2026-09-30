"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowLeft, ExternalLink, Loader2, RotateCw, X } from "lucide-react";
import { Link, useRouter } from "@/lib/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Money } from "@/components/ui/money";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { VisionListPagination } from "@/components/ui/vision-list-pagination";
import { CsvButton, ListState } from "@/components/list";
import { InvoiceStatusBadge, SalesAccessGate } from "@/features/sales";
import { formatDate } from "@/features/institutions";
import { isIsoDate } from "@/lib/domain/institutions/rules";
import { canRetryInvoice } from "@/lib/domain/invoices/logic";
import { INVOICE_STATUSES, type Invoice, type InvoiceStatus } from "@/lib/domain/invoices/types";
import { useApiErrorMessage } from "@/lib/hooks/use-api-error-message";
import { useRetryInvoice } from "../mutations";
import { useInvoices } from "../queries";

type Filter = "all" | InvoiceStatus;

const PAGE_SIZE = 25;

/** Faturalar (DeepSport InvoicesPage): durum sekmeleri, tarih aralığı, sayfalama, başarısız faturayı yeniden dene. Yalnız ADMIN. */
export function InvoicesPage() {
  return (
    <SalesAccessGate>
      <InvoicesContent />
    </SalesAccessGate>
  );
}

function InvoicesContent() {
  const t = useTranslations("sales.invoices");
  const tc = useTranslations("sales.common");
  const errorMessage = useApiErrorMessage();
  const searchParams = useSearchParams();
  const router = useRouter();

  const statusParam = searchParams.get("status") ?? "";
  const filter: Filter = (INVOICE_STATUSES as readonly string[]).includes(statusParam) ? (statusParam as InvoiceStatus) : "all";
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10) || 0);
  const fromParam = searchParams.get("from") ?? "";
  const toParam = searchParams.get("to") ?? "";
  const from = isIsoDate(fromParam) ? fromParam : "";
  const to = isIsoDate(toParam) ? toParam : "";

  const query = useInvoices({ status: filter === "all" ? "" : filter, from, to, page, size: PAGE_SIZE });
  const [retryTarget, setRetryTarget] = useState<Invoice | null>(null);

  const patch = (changes: Record<string, string>, resetPage = true) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    if (resetPage) params.delete("page");
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  };

  const retry = useRetryInvoice();
  const submitRetry = (id: string) =>
    retry.mutate(id, {
      onSuccess: (inv) => {
        setRetryTarget(null);
        if (inv.status === "FAILED") toast.error(t("retryFailedAgain", { error: inv.error ?? "" }));
        else toast.success(t("retryOk"));
      },
      onError: (err) => toast.error(errorMessage(err, t("retryError"))),
    });

  const data = query.data;
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const counts = data?.counts;
  const countAll = counts ? INVOICE_STATUSES.reduce((sum, s) => sum + counts[s], 0) : 0;
  const modeLabel = (i: Invoice) =>
    i.mode === "PROVIDER" ? `${t("modes.PROVIDER")}${i.provider === "PARASUT" ? " · Paraşüt" : i.provider ? ` · ${i.provider}` : ""}` : t(`modes.${i.mode}`);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/crm" className={buttonVariants({ variant: "outline", size: "sm" })}>
          <ArrowLeft />
          {t("page.toSales")}
        </Link>
        <h1 className="text-xl font-bold tracking-tight">{t("page.title")}</h1>
        <InfoTip label={t("page.title")} align="start">
          <span className="block">{t("page.subtitle")}</span>
          <span className="mt-1 block">{t("statusNote")}</span>
          <span className="mt-1 block">{t("providerNote")}</span>
        </InfoTip>
      </div>

      <ListState isLoading={query.isLoading} isError={query.isError && !data} onRetry={() => void query.refetch()}>
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="overflow-x-auto">
            <SegmentedControl<Filter>
              value={filter}
              onValueChange={(v) => patch({ status: v === "all" ? "" : v })}
              aria-label={t("filterLabel")}
              options={(["all", ...INVOICE_STATUSES] as Filter[]).map((f) => ({
                value: f,
                label: `${f === "all" ? t("filters.all") : t(`statuses.${f}`)} (${f === "all" ? countAll : (counts?.[f] ?? 0)})`,
              }))}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="inv-from" className="text-sm text-muted-foreground">
              {t("filters.from")}:
            </label>
            <Input id="inv-from" type="date" value={from} max={to || undefined} onChange={(e) => patch({ from: e.target.value })} className="h-9 w-40" />
            <label htmlFor="inv-to" className="text-sm text-muted-foreground">
              {t("filters.to")}:
            </label>
            <Input id="inv-to" type="date" value={to} min={from || undefined} onChange={(e) => patch({ to: e.target.value })} className="h-9 w-40" />
            {from || to ? (
              <Button variant="ghost" size="sm" onClick={() => patch({ from: "", to: "" })}>
                <X />
                {t("filters.clear")}
              </Button>
            ) : null}
            <CsvButton
              filename="faturalar"
              header={[
                t("table.date"),
                t("table.customer"),
                t("table.description"),
                t("table.mode"),
                t("table.invoiceNo"),
                t("table.net"),
                t("table.vat"),
                t("table.amount"),
                t("table.status"),
                t("table.seller"),
                t("table.error"),
              ]}
              rows={() =>
                items.map((i) => [
                  i.issueDate,
                  i.customerName,
                  i.description,
                  modeLabel(i),
                  i.invoiceNo,
                  i.netAmount,
                  i.vatAmount,
                  i.amount,
                  t(`statuses.${i.status}`),
                  i.createdByName,
                  i.error,
                ])
              }
              financialColumns={[5, 6, 7]}
            />
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/60">
          <div className="w-full overflow-x-auto">
            <Table className="min-w-max [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap [&_thead_tr]:bg-muted/40">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("table.date")}</TableHead>
                  <TableHead>{t("table.customer")}</TableHead>
                  <TableHead>{t("table.description")}</TableHead>
                  <TableHead>{t("table.mode")}</TableHead>
                  <TableHead>{t("table.invoiceNo")}</TableHead>
                  <TableHead className="text-right">{t("table.amount")}</TableHead>
                  <TableHead>{t("table.status")}</TableHead>
                  <TableHead>{t("table.seller")}</TableHead>
                  <TableHead>{t("table.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
                      {t("empty")}
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell className="tabular-nums">{formatDate(i.issueDate)}</TableCell>
                      <TableCell>
                        <Link href={`/institutions/${i.institutionId}`} className="font-medium hover:underline">
                          {i.customerName || "—"}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-64 truncate" title={i.description}>
                        {i.description}
                      </TableCell>
                      <TableCell className="text-sm">
                        {modeLabel(i)}
                        {i.mode === "EMAIL" && i.recipientEmails.length ? (
                          <span className="block text-xs text-muted-foreground">{i.recipientEmails.join(", ")}</span>
                        ) : null}
                      </TableCell>
                      <TableCell className="tabular-nums">{i.invoiceNo || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        <Money value={i.amount} fractionDigits={2} />
                      </TableCell>
                      <TableCell>
                        <InvoiceStatusBadge status={i.status} />
                        {i.status === "FAILED" && i.error ? (
                          <span className="block max-w-56 truncate text-xs text-destructive" title={i.error}>
                            {i.error}
                          </span>
                        ) : null}
                        {i.attempts > 1 ? <span className="block text-xs text-muted-foreground">{t("attempts", { count: i.attempts })}</span> : null}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{i.createdByName ?? "—"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {i.pdfUrl ? (
                            <a href={i.pdfUrl} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                              <ExternalLink />
                              {t("pdf")}
                            </a>
                          ) : null}
                          {canRetryInvoice(i) ? (
                            <Button size="sm" variant="outline" onClick={() => setRetryTarget(i)}>
                              <RotateCw />
                              {t("retry")}
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {total > PAGE_SIZE ? (
            <div className="border-t border-border/60 py-4">
              <VisionListPagination
                currentPage={page}
                totalPages={totalPages}
                onPageChange={(next) => patch({ page: next ? String(next) : "" }, false)}
                from={page * PAGE_SIZE + 1}
                to={Math.min((page + 1) * PAGE_SIZE, total)}
                total={total}
                renderShowing={(a, b, c) => t("pagination.showing", { from: a, to: b, total: c })}
                previousLabel={t("pagination.previous")}
                nextLabel={t("pagination.next")}
              />
            </div>
          ) : null}
        </div>
      </ListState>

      <Dialog open={!!retryTarget} onOpenChange={(o) => !o && !retry.isPending && setRetryTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("retryTitle")}</DialogTitle>
            <DialogDescription>{retryTarget ? t("retryBody", { customer: retryTarget.customerName || "—", mode: modeLabel(retryTarget) }) : ""}</DialogDescription>
          </DialogHeader>
          {retryTarget?.error ? <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">{retryTarget.error}</p> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRetryTarget(null)} disabled={retry.isPending}>
              {tc("cancel")}
            </Button>
            <Button onClick={() => retryTarget && submitRetry(retryTarget.id)} disabled={retry.isPending} aria-busy={retry.isPending}>
              {retry.isPending ? <Loader2 className="animate-spin" /> : null}
              {t("retry")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
