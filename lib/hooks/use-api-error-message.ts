"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { apiErrorCode, apiErrorKind } from "@/lib/api/errors";

/**
 * Hata → çevrilmiş mesaj. Önce sunucunun iş kuralı kodu (common.errors.codes.<KOD>, ör. BILLING_REQUIRED),
 * yoksa HTTP türü. `fallback` verilirse "generic" durumda o kullanılır.
 */
export function useApiErrorMessage() {
  const t = useTranslations("common");
  return useCallback(
    (err: unknown, fallback?: string): string => {
      const code = apiErrorCode(err);
      if (code && t.has(`errors.codes.${code}`)) return t(`errors.codes.${code}`);
      const kind = apiErrorKind(err);
      if (kind === "generic") return fallback ?? t("errors.generic");
      return t(`errors.${kind}`);
    },
    [t]
  );
}
