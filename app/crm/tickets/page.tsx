import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { TicketsPage } from "@/features/tickets";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("navigation");
  return { title: t("crmTickets"), description: t("crmTicketsDescription") };
}

/** Destek talepleri — her CRM kullanıcısı (CRM_AGENT_PATHS "/crm"). */
export default function CrmTicketsPage() {
  return (
    <div className="container mx-auto p-6">
      <TicketsPage />
    </div>
  );
}
