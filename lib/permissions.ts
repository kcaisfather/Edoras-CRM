import type { CurrentUser, PanelRole } from "@/lib/domain/auth/types";

/**
 * CRM_AGENT'ın erişebildiği route önekleri. Yeni modül taşındıkça buraya eklenir. `/crm` (Adaylar ve
 * Satış Analizleri) açık; tutarlar sunucuda boşaltılır, arayüzde FinancialOnly gizler.
 * Yalnız arayüz koruması — asıl koruma sunucuda (lib/api/server.ts → requireStaff({ role: "ADMIN" })).
 */
export const CRM_AGENT_PATHS = ["/dashboard", "/crm", "/institutions", "/settings"] as const;

/** Oturum gerektirmeyen yollar (giriş sayfası). */
export const PUBLIC_PATHS = ["/login"] as const;

function matchesPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

export function isPublicPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return PUBLIC_PATHS.some((p) => matchesPrefix(pathname, p));
}

/** Rol bilinmiyorsa en dar yetki (fail-closed). */
export function panelRoleOf(user: CurrentUser | null | undefined): PanelRole {
  return user?.role ?? "CRM_AGENT";
}

/** Rolün bu yola erişimi var mı. Sorgu dizesi (?tab=…) ve hash yok sayılır. */
export function canAccessPathFor(role: PanelRole, pathname: string): boolean {
  if (role === "ADMIN") return true;
  const path = pathname.split(/[?#]/)[0] || "/";
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
