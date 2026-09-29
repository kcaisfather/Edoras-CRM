import { getRequestConfig } from "next-intl/server";

/**
 * Panel yalnız Türkçe: next-intl "i18n yönlendirmesi olmadan" kullanılır (URL'de /tr yok, dil seçici yok).
 * Metinler messages/tr.json'da; DeepSportAdmin'den taşınan ekranlar `useTranslations` ile değişmeden çalışır.
 */
export default getRequestConfig(async () => ({
  locale: "tr",
  timeZone: "Europe/Istanbul",
  messages: (await import("@/messages/tr.json")).default,
}));
