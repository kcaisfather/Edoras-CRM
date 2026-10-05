"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { apiErrorCode, apiErrorFieldDetail, apiErrorKind } from "@/lib/api/errors";

/**
 * Hata → çevrilmiş mesaj. Girdi hatasında alan mesajları eklenir; önce sunucunun iş kuralı kodu (common.errors.codes.<KOD>, ör. BILLING_REQUIRED),
 * yoksa HTTP türü. `fallback` verilirse "generic" durumda o kullanılır.
 */
export function useApiErrorMessage() {
  const t = useTranslations("common");
  return useCallback(
    (err: unknown, fallback?: string): string => {
      const code = apiErrorCode(err);
      // Girdi hatasında hangi alanın neden reddedildiği de gösterilir ("Bilgiler geçersiz (Kurum adı zorunlu)").
      if (code === "VALIDATION" || (!code && apiErrorKind(err) === "validation")) {
        const detail = apiErrorFieldDetail(err);
        if (detail) return `${t("errors.codes.VALIDATION")} (${detail})`;
      }
      if (code && t.has(`errors.codes.${code}`)) return t(`errors.codes.${code}`);
      const kind = apiErrorKind(err);
      if (kind === "generic") return fallback ?? t("errors.generic");
      return t(`errors.${kind}`);
    },
    [t]
  );
}
