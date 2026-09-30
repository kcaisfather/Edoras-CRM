import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { OpenReceivablesCard } from "@/features/crm";
import { PaymentHistoryList, SalesAccessGate } from "@/features/sales";
import { Skeleton } from "@/components/ui/skeleton";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("navigation");
  return { title: t("paymentHistory"), description: t("paymentHistoryDescription") };
}

/**
 * Ödeme Geçmişi (DeepSport /payment-history): açık alacak özeti + tüm kurumların ödemeleri. Tutarlar yalnız ADMIN'e
 * (yol CRM_AGENT_PATHS'te değil; kapı ikinci savunma hattı, uç da 403 döner). Adaylar özeti route'ta verilir: satış
 * modülü CRM'i import etmez.
 */
export default function PaymentHistoryPage() {
  return (
    <div className="container mx-auto space-y-6 p-6">
      <SalesAccessGate>
        <OpenReceivablesCard />
        {/* Süzgeçler, sayfa ve arama URL'de (useSearchParams) — istemcide çözülür. */}
        <Suspense fallback={<Skeleton className="h-64 w-full rounded-2xl" />}>
          <PaymentHistoryList />
        </Suspense>
      </SalesAccessGate>
    </div>
  );
}
