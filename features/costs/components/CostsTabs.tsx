"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/lib/navigation";
import { cn } from "@/lib/utils";

/**
 * Sekmeler (DeepSport CostsTabs). Microservices, Query (küp) ve Reconcile (AWS mutabakatı) taşınmadı; yerlerine Kayıtlar (maliyet
 * defteri) ve Kurumlar (kurum başına maliyet ve marj) geldi.
 */
const COST_TABS = [
  { href: "/costs", key: "overview" as const, exact: true },
  { href: "/costs/services", key: "services" as const },
  { href: "/costs/entries", key: "entries" as const },
  { href: "/costs/institutions", key: "institutions" as const },
  { href: "/costs/budgets", key: "budgets" as const },
  { href: "/costs/alerts", key: "alerts" as const },
  { href: "/costs/exports", key: "exports" as const },
];

/** Maliyet bölümü sekme gezintisi — aktif sekme için usePathname gerektiğinden istemci bileşeni. */
export function CostsTabs() {
  const t = useTranslations("costs");
  const tTabs = useTranslations("costs.tabs");
  const pathname = usePathname();

  return (
    <nav aria-label={t("sectionNavLabel")} className="no-scrollbar flex w-fit max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-border bg-muted/60 p-1">
      {COST_TABS.map((tab) => {
        const isActive = tab.exact ? pathname === tab.href : pathname === tab.href || pathname?.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex h-8 shrink-0 items-center whitespace-nowrap rounded-lg px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
              isActive ? "bg-background text-foreground shadow-sm ring-1 ring-border/60 dark:bg-accent" : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
            )}
          >
            {tTabs(tab.key)}
          </Link>
        );
      })}
    </nav>
  );
}
