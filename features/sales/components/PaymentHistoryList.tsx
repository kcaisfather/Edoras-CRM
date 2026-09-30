"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { AlertCircle, CreditCard, RotateCcw, X } from "lucide-react";
import { Link, useRouter } from "@/lib/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Money } from "@/components/ui/money";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { VisionListPagination } from "@/components/ui/vision-list-pagination";
import { SearchBox } from "@/components/list";
import { isIsoDate } from "@/lib/domain/institutions/rules";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/domain/institutions/types";
import type { SalePayment } from "@/lib/domain/invoices/types";
import { useMounted } from "@/lib/hooks/use-mounted";
import { useSalePayments } from "../queries";
import { InvoiceStatusBadge } from "./InvoiceStatusBadge";

const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZES = [10, 20, 50, 100] as const;
const ALL = "__all__";

const DATE = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const formatDay = (iso: string) => DATE.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`));

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (parts.length >= 2 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toLocaleUpperCase("tr-TR");
}

function PaymentsGrid({ items }: { items: SalePayment[] }) {
  const t = useTranslations("paymentHistory");
  const tMethod = useTranslations("institutions.paymentMethod");
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-12 gap-4 px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <div className="col-span-5 lg:col-span-4">{t("table.institution")}</div>
        <div className="col-span-4 lg:col-span-4">{t("table.transactionDetails")}</div>
        <div className="hidden items-center lg:col-span-1 lg:flex">{t("table.invoice")}</div>
        <div className="col-span-3 text-right lg:col-span-3">{t("table.amountTime")}</div>
      </div>
      {items.map((p) => (
        <div
          key={p.id}
          className="grid grid-cols-12 items-center gap-4 rounded-2xl border border-border/70 bg-card/70 p-4 shadow-sm transition-colors hover:border-border hover:bg-muted/50"
        >
          <div className="col-span-5 flex min-w-0 items-center gap-3 lg:col-span-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-primary/10 text-sm font-bold text-primary">
              {initials(p.institutionName)}
            </div>
            <div className="min-w-0">
              <Link href={`/institutions/${p.institutionId}`} className="block truncate text-sm font-bold tracking-wide hover:underline">
                {p.institutionName}
              </Link>
              {p.sellerName ? <p className="truncate text-xs text-muted-foreground">{t("seller", { name: p.sellerName })}</p> : null}
            </div>
          </div>
          <div className="col-span-4 min-w-0 lg:col-span-4">
            <p className="truncate text-sm font-medium">{tMethod(p.method)}</p>
            {p.note ? (
              <p className="truncate text-xs text-muted-foreground" title={p.note}>
                {p.note}
              </p>
            ) : (
              <p className="truncate text-xs text-muted-foreground">#{p.id.slice(0, 8)}</p>
            )}
          </div>
          <div className="hidden items-center lg:col-span-1 lg:flex">
            {p.invoice ? <InvoiceStatusBadge status={p.invoice.status} /> : <span className="text-xs text-muted-foreground">{t("noInvoice")}</span>}
          </div>
          <div className="col-span-3 flex flex-col items-end justify-center text-right lg:col-span-3">
            <p className="text-base font-semibold tracking-tight">
              <Money value={p.amount} fractionDigits={2} />
            </p>
            <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{formatDay(p.paidOn)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-16 w-full rounded-2xl" />
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-20 w-full rounded-2xl" />
      ))}
    </div>
  );
}

/**
 * Ödeme Geçmişi (DeepSport ProductLogsList'in Edoras karşılığı): tüm kurumların crm_payments kayıtları. Süzgeçler URL'de
 * (?q= kurum adı, ?method=, ?from=, ?to=, ?page=, ?size=) ve sunucuda uygulanır; toplam, süzgece uyan TÜM kayıtlarındır.
 * useSearchParams kullanır: sayfası <Suspense> ile sarılmalı.
 */
export function PaymentHistoryList() {
  const t = useTranslations("paymentHistory");
  const tMethod = useTranslations("institutions.paymentMethod");
  const searchParams = useSearchParams();
  const router = useRouter();
  const mounted = useMounted();

  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10) || 0);
  const sizeParam = parseInt(searchParams.get("size") ?? "", 10);
  const size = (PAGE_SIZES as readonly number[]).includes(sizeParam) ? sizeParam : DEFAULT_PAGE_SIZE;
  const query = searchParams.get("q") ?? "";
  const methodParam = searchParams.get("method") ?? "";
  const method = (PAYMENT_METHODS as readonly string[]).includes(methodParam) ? (methodParam as PaymentMethod) : "";
  const fromParam = searchParams.get("from") ?? "";
  const toParam = searchParams.get("to") ?? "";
  const from = isIsoDate(fromParam) ? fromParam : "";
  const to = isIsoDate(toParam) ? toParam : "";

  const { data, isLoading, isError, refetch } = useSalePayments({ page, size, query, method, from, to });

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

  const [rendered, setRendered] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setRendered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  if (!mounted || !rendered || (isLoading && !data)) return <ListSkeleton />;
  if (isError && !data) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription className="flex items-center justify-between gap-3">
          <span>{t("error.message")}</span>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            <RotateCcw />
            {t("error.retry")}
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / size));
  const items = data?.items ?? [];
  const fromNo = total === 0 ? 0 : page * size + 1;
  const toNo = Math.min((page + 1) * size, total);
  const filtered = Boolean(query || method || from || to);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card/60 p-4 lg:flex-row lg:flex-wrap lg:items-end">
        <SearchBox value={query} onChange={(v) => patch({ q: v })} placeholder={t("filters.search")} />
        <div className="flex items-center gap-2">
          <label htmlFor="pay-method" className="text-sm text-muted-foreground">
            {t("filters.method")}:
          </label>
          <Select value={method || ALL} onValueChange={(v) => patch({ method: v === ALL ? "" : v })}>
            <SelectTrigger id="pay-method" className="min-w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("filters.allMethods")}</SelectItem>
              {PAYMENT_METHODS.map((m) => (
                <SelectItem key={m} value={m}>
                  {tMethod(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="pay-from" className="text-sm text-muted-foreground">
            {t("filters.from")}:
          </label>
          <Input id="pay-from" type="date" value={from} max={to || undefined} onChange={(e) => patch({ from: e.target.value })} className="h-9 w-40" />
          <label htmlFor="pay-to" className="text-sm text-muted-foreground">
            {t("filters.to")}:
          </label>
          <Input id="pay-to" type="date" value={to} min={from || undefined} onChange={(e) => patch({ to: e.target.value })} className="h-9 w-40" />
        </div>
        {filtered ? (
          <Button variant="ghost" size="sm" onClick={() => patch({ q: "", method: "", from: "", to: "" })}>
            <X />
            {t("filters.clear")}
          </Button>
        ) : null}
        <div className="flex items-center gap-2 lg:ml-auto">
          <label htmlFor="pay-size" className="text-sm text-muted-foreground">
            {t("pagination.pageSize")}:
          </label>
          <Select value={String(size)} onValueChange={(v) => patch({ size: v === String(DEFAULT_PAGE_SIZE) ? "" : v })}>
            <SelectTrigger id="pay-size" className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {total > 0 ? (
        <p className="text-right text-sm text-muted-foreground">
          {t("grandTotal", { count: total })}{" "}
          <span className="font-semibold text-foreground">
            <Money value={data?.totalAmount ?? 0} fractionDigits={2} />
          </span>
        </p>
      ) : null}

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <CreditCard className="mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="mb-2 text-lg font-semibold">{t("empty.title")}</h3>
          <p className="max-w-sm text-sm text-muted-foreground">{t("empty.description")}</p>
        </div>
      ) : (
        <>
          <PaymentsGrid items={items} />
          <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/60 pb-8 pt-6">
            <VisionListPagination
              currentPage={page}
              totalPages={totalPages}
              onPageChange={(next) => patch({ page: next ? String(next) : "" }, false)}
              from={fromNo}
              to={toNo}
              total={total}
              renderShowing={(a, b, c) => (
                <>
                  <span className="font-medium text-foreground">{a}</span> - <span className="font-medium text-foreground">{b}</span>
                  {t("pagination.showingMiddle")}
                  <span className="font-medium text-foreground">{c}</span> {t("pagination.unit")}
                </>
              )}
              previousLabel={t("pagination.previous")}
              nextLabel={t("pagination.next")}
            />
          </div>
        </>
      )}
    </div>
  );
}
