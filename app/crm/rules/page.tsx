import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RulesEditor } from "@/features/tasks";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("navigation");
  return { title: t("crmRules"), description: t("crmRulesDescription") };
}

/** Takip kuralları — yalnız yönetici (CRM_AGENT_DENIED_PATHS; PUT /api/crm/rules da 403). */
export default function CrmRulesPage() {
  return (
    <div className="container mx-auto p-6">
      <RulesEditor />
    </div>
  );
}
