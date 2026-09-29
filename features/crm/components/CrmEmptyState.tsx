"use client";

import { useTranslations } from "next-intl";
import { ClipboardList } from "lucide-react";

export function CrmEmptyState() {
  const t = useTranslations("crm.list");

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <ClipboardList className="h-12 w-12 text-muted-foreground mb-4" />
      <h3 className="text-lg font-semibold mb-2">{t("emptyTitle")}</h3>
      <p className="text-sm text-muted-foreground max-w-sm">{t("empty")}</p>
    </div>
  );
}
