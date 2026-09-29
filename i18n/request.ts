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
    settingsx: (await import("@/messages/features/settingsx.tr.json")).default,
    // Soğuk listeler ve içe aktarma DeepSport'taki ad alanlarında: growth.coldLists, growth.import.
    growth: (await import("@/messages/features/growth.tr.json")).default,
    // Görevler ve kurallar DeepSport'taki ad alanlarında: crm.tasks, crm.rules, crm.nav.
    crm: deepMergeMessages(
      (await import("@/messages/features/crm.tr.json")).default,
      (await import("@/messages/features/tasks.tr.json")).default
    ),
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
