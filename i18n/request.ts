import { getRequestConfig } from "next-intl/server";

type Messages = Record<string, unknown>;

function isPlainObject(value: unknown): value is Messages {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `extra`'yı `base` üzerine derinlemesine birleştirir (extra kazanır). Girdileri değiştirmez. */
export function deepMergeMessages(base: Messages, extra: Messages): Messages {
  const out: Messages = { ...base };
  for (const [key, value] of Object.entries(extra)) {
    const current = out[key];
    out[key] = isPlainObject(current) && isPlainObject(value) ? deepMergeMessages(current, value) : value;
  }
  return out;
}

/**
 * Modül bazlı mesaj dosyaları (DeepSportAdmin düzeni): her modül kendi dosyasının sahibidir, ana
 * messages/tr.json'a dokunmaz. Anahtar = hedef ad alanı; mevcut bir ad alanına verilirse birleşir.
 * Statik import'lar bilinçli — Next.js'in paket analizi için. Yeni modül: dosyayı ekle, buraya bir satır.
 */
async function loadFeatureMessages(): Promise<Record<string, Messages>> {
  return {
    shell: (await import("@/messages/features/shell.tr.json")).default,
    // Konum alanları (Ülke/İl/İlçe listeleri) DeepSport'taki ad alanında: locations.*
    locations: (await import("@/messages/features/locations.tr.json")).default,
    settingsx: (await import("@/messages/features/settingsx.tr.json")).default,
    // Soğuk listeler ve içe aktarma DeepSport'taki ad alanlarında: growth.coldLists, growth.import.
    // Müşteri analizleri (growth.customers, growth.analytics, growth.usage…) growthx.tr.json'da; aynı ad alanına birleşir.
    growth: deepMergeMessages(
      (await import("@/messages/features/growth.tr.json")).default,
      (await import("@/messages/features/growthx.tr.json")).default
    ),
    // Görevler ve kurallar DeepSport'taki ad alanlarında: crm.tasks, crm.rules, crm.nav.
    crm: deepMergeMessages(
      (await import("@/messages/features/crm.tr.json")).default,
      (await import("@/messages/features/tasks.tr.json")).default
    ),
    // Anketler DeepSport'taki ad alanında: surveys.* (herkese açık sayfa dahil: surveys.public, surveys.form).
    surveys: (await import("@/messages/features/surveys.tr.json")).default,
    // Satış ve faturalar DeepSport'taki ad alanlarında: paymentHistory.* (Ödeme Geçmişi), sales.* (faturalar, fatura profili).
    paymentHistory: (await import("@/messages/features/paymentsx.tr.json")).default,
    sales: (await import("@/messages/features/sales.tr.json")).default,
    // Aktivite geçmişi (Kurum etkinliği + CRM işlem kaydı) ve Maliyetler DeepSport'taki ad alanlarında: activityHistory.*, costs.*.
    activityHistory: (await import("@/messages/features/activity.tr.json")).default,
    costs: (await import("@/messages/features/costs.tr.json")).default,
  };
}

/**
 * Panel yalnız Türkçe: next-intl "i18n yönlendirmesi olmadan" kullanılır (URL'de /tr yok, dil seçici yok).
 * DeepSportAdmin'den taşınan ekranlar `useTranslations` ile değişmeden çalışır.
 */
export default getRequestConfig(async () => ({
  locale: "tr",
  timeZone: "Europe/Istanbul",
  messages: deepMergeMessages((await import("@/messages/tr.json")).default, await loadFeatureMessages()),
}));
