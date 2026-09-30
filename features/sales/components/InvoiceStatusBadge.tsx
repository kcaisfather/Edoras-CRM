"use client";

import { useTranslations } from "next-intl";
import { INVOICE_STATUS_TONE } from "@/lib/domain/invoices/logic";
import type { InvoiceStatus } from "@/lib/domain/invoices/types";
import { cn } from "@/lib/utils";

const TONE_CLASS = {
  primary: "border-primary/25 bg-primary/10 text-primary",
  success: "border-success/25 bg-success/10 text-success",
  destructive: "border-destructive/25 bg-destructive/10 text-destructive",
  muted: "border-border bg-muted text-muted-foreground",
} as const;

/** Fatura durumu rozeti (Faturalar sayfası, Ödeme Geçmişi ve kurum ödeme listesi ortak). */
export function InvoiceStatusBadge({ status, className }: { status: InvoiceStatus; className?: string }) {
  const t = useTranslations("sales.invoices.statuses");
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium",
        TONE_CLASS[INVOICE_STATUS_TONE[status]],
        className
      )}
    >
      {t(status)}
    </span>
  );
}
