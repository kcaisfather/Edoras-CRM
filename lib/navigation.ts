/**
 * Gezinme — panel yalnız Türkçe, URL'de dil öneki yok. DeepSportAdmin'den taşınan kodda
 * next-intl yönlendirmesi (i18n/routing) yerine bu dosya kullanılır; adlar aynı
 * (Link, useRouter, usePathname, redirect), import yolunu değiştirmek yeter.
 */
export { default as Link } from "next/link";
export { redirect, usePathname, useRouter } from "next/navigation";
