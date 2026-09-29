"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/lib/navigation";
import { UserRound, LogOut, PanelLeftClose, PanelLeftOpen, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";
import { ShellControls } from "@/components/shell-controls";
import { Button } from "@/components/ui/button";
import { useLogout, usePermissions } from "@/features/auth";
import { useSidebarStore } from "@/lib/stores/sidebar";

import { isNavActive, useNavBadges, useVisibleNavGroups } from "@/components/navigation";
/** Masaüstü ve mobil kenar çubuğunun ortak menü bağlantısı (tek görünüm kaynağı). */
export function SidebarNavLink({
  href,
  icon: Icon,
  label,
  isActive,
  expanded,
  onNavigate,
  badge,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  isActive: boolean;
  expanded: boolean;
  onNavigate?: () => void;
  /** Sayı rozeti; count 0/yoksa çizilmez. `label` ekran okuyucu metnidir. */
  badge?: { count: number; label: string };
}) {
  const showBadge = !!badge && badge.count > 0;
  const badgeText = showBadge ? (badge.count > 99 ? "99+" : String(badge.count)) : "";
  return (
    <Link
      href={href}
      onClick={onNavigate}
      title={showBadge ? `${label} · ${badge.label}` : label}
      aria-label={expanded ? undefined : showBadge ? `${label}, ${badge.label}` : label}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "rounded-xl flex items-center border transition-colors duration-200 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
        expanded ? "gap-3 px-4 py-3" : "w-12 h-12 justify-center",
        isActive
          ? "bg-primary/10 border-primary/20 text-primary shadow-sm hover:bg-primary/15"
          : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground"
      )}
    >
      {expanded ? (
        <Icon className="h-5 w-5 shrink-0" />
      ) : (
        <span className="relative inline-flex">
          <Icon className="h-6 w-6 shrink-0" />
          {showBadge && (
            <span
              aria-hidden
              className="absolute -right-2 -top-1.5 min-w-4 h-4 px-1 rounded-full bg-destructive text-white text-[10px] font-semibold leading-4 text-center ring-2 ring-background tabular-nums"
            >
              {badgeText}
            </span>
          )}
        </span>
      )}
      {expanded && <span className="font-medium text-sm truncate">{label}</span>}
      {expanded && showBadge && (
        <>
          <span
            aria-hidden
            className="ml-auto shrink-0 min-w-5 h-5 px-1.5 rounded-full bg-destructive text-white text-[11px] font-semibold leading-5 text-center tabular-nums"
          >
            {badgeText}
          </span>
          <span className="sr-only">{badge.label}</span>
        </>
      )}
    </Link>
  );
}

export const sidebarSectionLabelClass =
  "pt-6 pb-2 px-4 uppercase text-[10px] tracking-[0.2em] font-bold text-muted-foreground";

export function Sidebar() {
  const t = useTranslations("navigation");
  const pathname = usePathname();
  const logoutMutation = useLogout();
  const expanded = useSidebarStore((s) => s.expanded);
  const toggle = useSidebarStore((s) => s.toggle);
  const groups = useVisibleNavGroups();
  const badges = useNavBadges();
  const { homePath } = usePermissions();

  const isActive = (href: string) => isNavActive(pathname, href);

  if (expanded) {
    return (
      <>
        <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-72 flex-col z-30 glass-sidebar">
          <div className="px-5 pt-7 pb-4 flex items-center gap-2">
            <Link
              href={homePath}
              className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg shadow-primary/20 shrink-0 overflow-hidden"
            >
              <Logo width={40} height={40} />
            </Link>
            <h1 className="min-w-0 flex-1 whitespace-nowrap text-lg font-bold tracking-tight text-foreground">
              Edoras <span className="text-primary font-medium">CRM</span>
            </h1>
            <Button
              variant="ghost"
              size="icon-sm"
              className="shrink-0 text-muted-foreground"
              onClick={toggle}
              aria-label={t("sidebarCollapse")}
              title={t("sidebarCollapse")}
            >
              <PanelLeftClose />
            </Button>
          </div>
          <nav className="flex-1 px-4 space-y-2 mt-4 overflow-y-auto min-h-0">
            {groups.map((group) => (
              <div key={group.key} className="space-y-2">
                {group.labelKey && <div className={sidebarSectionLabelClass}>{t(group.labelKey)}</div>}
                {group.items.map((item) => (
                  <SidebarNavLink
                    key={item.href}
                    href={item.href}
                    icon={item.icon}
                    label={t(item.translationKey)}
                    isActive={isActive(item.href)}
                    expanded
                    badge={badges[item.href]}
                  />
                ))}
              </div>
            ))}
          </nav>
          <div className="p-6 flex flex-col gap-2 border-t border-border">
            <div className="glass-panel p-4 rounded-2xl flex items-center gap-3 border border-border">
              <div className="w-10 h-10 rounded-full bg-muted shrink-0 flex items-center justify-center overflow-hidden">
                <UserRound className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <Link
                  href="/settings"
                  className="text-sm font-semibold truncate text-foreground hover:underline block"
                >
                  {t("myProfile")}
                </Link>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 text-muted-foreground"
                onClick={() => logoutMutation.mutate()}
                disabled={logoutMutation.isPending}
                aria-busy={logoutMutation.isPending}
                aria-label={t("logout")}
                title={t("logout")}
              >
                {logoutMutation.isPending ? <Loader2 className="animate-spin" /> : <LogOut />}
              </Button>
            </div>
            <ShellControls />
          </div>
        </aside>

      </>
    );
  }

  return (
    <>
      <aside className="hidden md:flex fixed left-4 top-4 bottom-4 w-20 flex-col items-center py-6 px-2 z-30 glass-panel border-r border-border/50 rounded-3xl h-[calc(100vh-2rem)] transition-all duration-300">
        <div className="mb-6 flex flex-col items-center gap-2">
          <Link
            href={homePath}
            className="flex items-center justify-center w-10 h-10 rounded-xl shadow-lg shadow-primary/20 shrink-0 overflow-hidden"
          >
            <Logo width={40} height={40} />
          </Link>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={toggle}
            title={t("sidebarExpand")}
            aria-label={t("sidebarExpand")}
            className="shrink-0 text-muted-foreground"
          >
            <PanelLeftOpen />
          </Button>
        </div>
        <nav className="flex-1 flex flex-col items-center gap-2 w-full min-w-0 min-h-0 overflow-y-auto [scrollbar-width:none]">
          {groups.map((group, index) => (
            <div key={group.key} className="flex flex-col items-center gap-2 w-full">
              {index > 0 && (
                <div className="w-full h-px bg-gradient-to-r from-transparent via-border to-transparent my-2" />
              )}
              {group.items.map((item) => (
                <SidebarNavLink
                  key={item.href}
                  href={item.href}
                  icon={item.icon}
                  label={t(item.translationKey)}
                  isActive={isActive(item.href)}
                  expanded={false}
                  badge={badges[item.href]}
                />
              ))}
            </div>
          ))}
        </nav>
        <div className="mt-auto pt-4 flex flex-col gap-2 items-center">
          <SidebarNavLink
            href="/settings"
            icon={UserRound}
            label={t("myProfile")}
            isActive={pathname === "/settings"}
            expanded={false}
          />
          <ShellControls orientation="column" />
        </div>
      </aside>

    </>
  );
}
