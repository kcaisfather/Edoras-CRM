"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/features/auth";
import { InvoiceStatusBadge } from "@/features/sales";
import { useInstitutionInvoices } from "../queries";
import { InvoiceDialog } from "./InvoiceDialog";

/**
 * Kurum ödeme listesindeki bir satırın fatura parçası: bu ödemeye bağlı en son faturanın durumu + "Fatura kes".
 * Kurum sayfasının route dosyası verir (kurumlar modülü faturaları import etmez). Yalnız ADMIN'e çizilir.
 * Fatura zaten varsa düğme "Yeni fatura" olur; pencere mükerrer uyarısını ayrıca gösterir.
 */
export function PaymentInvoiceAction({ institutionId, paymentId, licenseId }: { institutionId: string; paymentId: string; licenseId: string | null }) {
  const { canSeeFinancials } = usePermissions();
  if (!canSeeFinancials) return null;
  return <Inner institutionId={institutionId} paymentId={paymentId} licenseId={licenseId} />;
}

function Inner({ institutionId, paymentId, licenseId }: { institutionId: string; paymentId: string; licenseId: string | null }) {
  const t = useTranslations("sales.invoices.paymentAction");
  const [open, setOpen] = useState(false);
  const invoices = useInstitutionInvoices(institutionId);
  const latest = invoices.data?.items.find((i) => i.paymentId === paymentId) ?? null;

  return (
    <span className="inline-flex items-center gap-2">
      {latest ? <InvoiceStatusBadge status={latest.status} /> : null}
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <FileText />
        {latest ? t("more") : t("issue")}
      </Button>
      <InvoiceDialog target={{ institutionId, paymentId, licenseId }} open={open} onOpenChange={setOpen} />
    </span>
  );
}
