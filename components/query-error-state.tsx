"use client";

import { useTranslations } from "next-intl";
import { AlertCircle, RotateCcw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/** Sorgu hata kutusu: kısa mesaj + "Tekrar dene" (hata, veriyi kullanan bileşende gösterilir). */
export function QueryErrorState({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations("common");

  return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertDescription className="flex items-center justify-between gap-3">
        <span>{t("errors.fetchFailed")}</span>
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCcw />
          {t("retry")}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
