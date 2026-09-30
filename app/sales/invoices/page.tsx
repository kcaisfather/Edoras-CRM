import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { InvoicesPage } from "@/features/invoices";
import { Skeleton } from "@/components/ui/skeleton";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("navigation");
  return { title: t("salesInvoices"), description: t("salesInvoicesDescription") };
}

/** Faturalar (madde 9) — yalnız ADMIN (yol CRM_AGENT_PATHS'te değil; kapı ikinci savunma hattı, uçlar 403 döner). */
export default function SalesInvoicesPage() {
  return (
    <div className="container mx-auto p-4 md:p-6">
      {/* Durum sekmesi, tarih aralığı ve sayfa URL'de (useSearchParams) — istemcide çözülür. */}
      <Suspense fallback={<Skeleton className="h-64 w-full rounded-2xl" />}>
        <InvoicesPage />
      </Suspense>
    </div>
  );
}
