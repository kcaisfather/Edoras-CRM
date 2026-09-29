"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, RotateCcw } from "lucide-react";

export function CrmErrorState({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations("crm.list");

  return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertDescription className="flex items-center justify-between gap-3">
        <span>{t("error")}</span>
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCcw />
          {t("retry")}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
