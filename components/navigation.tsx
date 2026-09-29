"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Building2, LayoutDashboard } from "lucide-react";
import { useCurrentUser, usePermissions } from "@/features/auth";
import { useInstitutionAlerts } from "@/features/institutions";
import { filterNavGroups } from "@/lib/permissions";

export type NavTranslationKey = "dashboard" | "institutions";

export interface NavItem {
  /** Sorgu dizesi içerebilir; aktiflik yalnız yol kısmına bakar. */
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  translationKey: NavTranslationKey;
  /** Yalnız ADMIN rolü. */
  adminOnly?: boolean;
}

export type NavGroupKey = "main" | "customers";

export interface NavGroup {
  key: NavGroupKey;
  /** Bölüm başlığı; ana grupta başlık yok. */
  labelKey?: "sidebarCustomers";
  items: NavItem[];
}

/**
 * Menü. DeepSportAdmin'den modül taşındıkça gruplar buraya eklenir (CRM, Satış & Fatura, Analiz…).
 * Görünürlük `useVisibleNavGroups` ile role göre süzülür — masaüstü, mobil ve komut paleti tek kaynak.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    key: "main",
    items: [{ href: "/dashboard", icon: LayoutDashboard, translationKey: "dashboard" }],
  },
  {
    key: "customers",
    labelKey: "sidebarCustomers",
    items: [{ href: "/institutions", icon: Building2, translationKey: "institutions" }],
  },
];

export function useVisibleNavGroups(): NavGroup[] {
  const { data: currentUser } = useCurrentUser();
  const { canAccessPath } = usePermissions();
  return filterNavGroups<NavItem, NavGroup>(NAV_GROUPS, {
    isAdmin: currentUser?.role === "ADMIN",
    canAccessPath,
  });
}

/** Alt rotaları olan ama kendisi ayrı bir menü öğesi olan kökler yalnız tam eşleşmede aktif sayılır. */
const EXACT_MATCH_HREFS = new Set(["/dashboard"]);

export function isNavActive(pathname: string | null | undefined, href: string) {
  if (!pathname) return false;
  const path = href.split("?")[0];
  return pathname === path || (!EXACT_MATCH_HREFS.has(path) && pathname.startsWith(path + "/"));
}

/**
 * Menü rozetleri (href → sayı ve erişilebilir etiket). Kurumlar: süresi dolmuş demo + bitmiş lisans
 * (aksiyon bekleyenler). Sayı 0 ise rozet çizilmez.
 */
export function useNavBadges(): Record<string, { count: number; label: string }> {
  const t = useTranslations("navigation");
  const alerts = useInstitutionAlerts();
  return useMemo(() => {
    const out: Record<string, { count: number; label: string }> = {};
    if (alerts > 0) out["/institutions"] = { count: alerts, label: t("institutionsAlertBadge", { count: alerts }) };
    return out;
  }, [alerts, t]);
}
