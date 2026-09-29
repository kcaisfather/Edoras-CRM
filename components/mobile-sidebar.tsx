"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/lib/navigation";
import { UserRound, LogOut, Loader2 } from "lucide-react";
import { Logo } from "@/components/logo";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ShellControls } from "@/components/shell-controls";
import { SidebarNavLink, sidebarSectionLabelClass } from "@/components/sidebar";
import { isNavActive, useVisibleNavGroups, useNavBadges } from "@/components/navigation";
import { useLogout, usePermissions } from "@/features/auth";

interface MobileSidebarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MobileSidebar({ open, onOpenChange }: MobileSidebarProps) {
  const t = useTranslations("navigation");
  const pathname = usePathname();
  const logoutMutation = useLogout();
  const groups = useVisibleNavGroups();
  const badges = useNavBadges();
  const { homePath } = usePermissions();

  const isActive = (href: string) => isNavActive(pathname, href);

  const close = () => onOpenChange(false);

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="left" className="w-72 p-0 flex flex-col">
          <SheetTitle className="sr-only">{t("menu")}</SheetTitle>
          <div className="p-6 flex items-center gap-3 border-b border-border">
            <Link
              href={homePath}
              onClick={close}
              className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg shadow-primary/20 shrink-0 overflow-hidden"
            >
              <Logo width={40} height={40} />
            </Link>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Edoras <span className="text-primary font-medium">CRM</span>
            </h1>
          </div>
          <nav className="flex-1 px-4 py-4 space-y-2 overflow-y-auto min-h-0">
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
                    onNavigate={close}
                    badge={badges[item.href]}
                  />
                ))}
              </div>
            ))}
          </nav>
          <div className="p-4 flex flex-col gap-2 border-t border-border">
            <div className="glass-panel p-4 rounded-2xl flex items-center gap-3 border border-border">
              <div className="w-10 h-10 rounded-full bg-muted shrink-0 flex items-center justify-center overflow-hidden">
                <UserRound className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <Link
                  href="/settings"
                  onClick={close}
                  className="text-sm font-semibold truncate text-foreground hover:underline block"
                >
                  {t("myProfile")}
                </Link>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 text-muted-foreground"
                onClick={() => {
                  logoutMutation.mutate();
                  close();
                }}
                disabled={logoutMutation.isPending}
                aria-busy={logoutMutation.isPending}
                aria-label={t("logout")}
                title={t("logout")}
              >
                {logoutMutation.isPending ? <Loader2 className="animate-spin" /> : <LogOut />}
              </Button>
            </div>
            {/* Genel kontroller (arama, bildirimler, tema, dil) — Cmd+K kısayolu masaüstü kopyasında dinlenir. */}
            <ShellControls shortcut={false} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
