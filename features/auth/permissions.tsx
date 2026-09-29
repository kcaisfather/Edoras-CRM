"use client";

import { type ReactNode } from "react";
import { canAccessPathFor, homePathFor, panelRoleOf } from "@/lib/permissions";
import { useMounted } from "@/lib/hooks/use-mounted";
import { useCurrentUser } from "./queries";

/**
 * Panel yetkileri. `canSeeFinancials` false ise tutar, toplam, satış/tahsilat/teklif/bakiye ve gelir
 * alanları GİZLENMELİ (CSV sütunları dahil). Yalnız arayüz gizlemesi — asıl koruma sunucuda: CRM_AGENT'a
 * tutar, TC/VKN ve adres hiç gönderilmez; ADMIN işlemlerinin uçları 403 döner.
 * `isAdmin`: ücretliye geçirme, lisans yenileme, fatura bilgisi ve ödeme gibi yönetici işlemleri.
 *
 * `canSeeFinancials` rol henüz bilinmezken (sunucu render'ı, profil yüklenirken) false döner:
 * CRM_AGENT profil gelmeden tutarları bir an bile görmesin. Sunucu ve ilk istemci render'ı aynı
 * (false) olduğu için hydration uyuşmazlığı yoktur.
 */
export function usePermissions() {
  const { data: user, isLoading } = useCurrentUser();
  const mounted = useMounted();
  const role = panelRoleOf(user);
  const resolved = mounted && !isLoading;
  return {
    isLoading: !resolved,
    role,
    isCrmAgent: role === "CRM_AGENT",
    isAdmin: resolved && role === "ADMIN",
    canSeeFinancials: resolved && role === "ADMIN",
    canAccessPath: (pathname: string) => canAccessPathFor(role, pathname),
    homePath: homePathFor(role),
  };
}

/** Tutar/toplam içeren parçayı yalnız finansal yetkisi olanlara gösterir. */
export function FinancialOnly({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  const { canSeeFinancials } = usePermissions();
  return canSeeFinancials ? children : fallback;
}
