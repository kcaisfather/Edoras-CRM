import type { CurrentUser, PanelRole } from "@/lib/domain/auth/types";

/**
 * CRM_AGENT'ın erişebildiği route önekleri. `/growth/customers` (Müşteri Takibi) açık — DeepSport'ta da CRM_AGENT yalnız bu
 * sayfayı görüyordu; lisans bedeli ve ödeme sunucuda boşaltılır. `/growth/analytics` (sızıntı, retention, birim ekonomisi) kapalı. Yeni modül taşındıkça buraya eklenir. `/crm` (Adaylar, Görevlerim, Soğuk
 * listeler, Anketler ve Satış Analizleri) açık — DeepSport'ta da CRM_AGENT soğuk listelere ve anketlere giriyordu; liste
 * silme yalnız ADMIN (DELETE /api/crm/prospect-lists/{id} 403). Tutarlar sunucuda boşaltılır, arayüzde FinancialOnly
 * gizler. Yalnız arayüz koruması — asıl koruma sunucuda (lib/api/server.ts → requireStaff({ role: "ADMIN" })).
 */
export const CRM_AGENT_PATHS = ["/dashboard", "/crm", "/institutions", "/growth/customers", "/settings"] as const;

/**
 * CRM_AGENT_PATHS altında olsa da CRM_AGENT'a kapalı yollar (DeepSport CRM_AGENT_DENIED_PATHS): kural motoru
 * yönetici işidir (PUT /api/crm/rules da 403).
 */
export const CRM_AGENT_DENIED_PATHS = ["/crm/rules"] as const;

/**
 * Müşteriye açık yollar (DeepSport PUBLIC_PATH_PREFIXES "/s/"): anket sayfası /s/[token], destek formu /t/[token] ve uçları /api/public/*.
 * CRM oturumuyla ilgisi yoktur: proxy.ts oturum çerezine hiç dokunmaz (tazelemez, /login'e yollamaz), panel kabuğu
 * çizilmez. Uçlar asla 401 dönmez; erişimi kişiye özel token belirler.
 */
export const CUSTOMER_PUBLIC_PATHS = ["/s", "/t", "/api/public"] as const;

/**
 * Zamanlayıcı yolları (/api/cron/*): oturum çerezi değil `Authorization: Bearer ${CRON_SECRET}` ile yetkilenir
 * (lib/server/cron-auth.ts). proxy.ts oturuma hiç dokunmaz; ucun kendisi secret'ı denetler. Müşteriye açık DEĞİLDİR
 * (isCustomerPublicPath false) ve isPublicPath listesinde değildir — sayfa yolu olarak oturum kuralı aynen geçerli.
 */
export const CRON_PATHS = ["/api/cron"] as const;

/** Oturum gerektirmeyen yollar: giriş sayfası + müşteriye açık anket yolları. */
export const PUBLIC_PATHS = ["/login", ...CUSTOMER_PUBLIC_PATHS] as const;

function matchesPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

export function isPublicPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return PUBLIC_PATHS.some((p) => matchesPrefix(pathname, p));
}

/** Müşteriye açık yol mu (proxy.ts oturum işini atlar). */
export function isCustomerPublicPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return CUSTOMER_PUBLIC_PATHS.some((p) => matchesPrefix(pathname, p));
}

/** Zamanlayıcı yolu mu (proxy.ts oturum işini atlar; yetki ucun içinde CRON_SECRET ile). */
export function isCronPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return CRON_PATHS.some((p) => matchesPrefix(pathname, p));
}

/** Rol bilinmiyorsa en dar yetki (fail-closed). */
export function panelRoleOf(user: CurrentUser | null | undefined): PanelRole {
  return user?.role ?? "CRM_AGENT";
}

/** Rolün bu yola erişimi var mı. Sorgu dizesi (?tab=…) ve hash yok sayılır. */
export function canAccessPathFor(role: PanelRole, pathname: string): boolean {
  if (role === "ADMIN") return true;
  const path = pathname.split(/[?#]/)[0] || "/";
  if (CRM_AGENT_DENIED_PATHS.some((p) => matchesPrefix(path, p))) return false;
  return CRM_AGENT_PATHS.some((p) => matchesPrefix(path, p));
}

/** Rolün ana sayfası (logo, yetkisiz yoldan yönlendirme, girişten sonra). */
export function homePathFor(_role: PanelRole): string {
  return "/dashboard";
}

interface NavFilterItem {
  href: string;
  adminOnly?: boolean;
}

interface NavFilterGroup<I extends NavFilterItem> {
  key: string;
  labelKey?: string;
  items: I[];
}

/** Menü görünürlüğü (kenar çubuğu, mobil menü, komut paleti tek kaynak); boş gruplar düşer. */
export function filterNavGroups<I extends NavFilterItem, G extends NavFilterGroup<I>>(
  groups: G[],
  opts: { isAdmin: boolean; canAccessPath: (href: string) => boolean }
): G[] {
  const visible = (item: I) => (!item.adminOnly || opts.isAdmin) && opts.canAccessPath(item.href);
  return groups.map((g) => ({ ...g, items: g.items.filter(visible) })).filter((g) => g.items.length > 0);
}
