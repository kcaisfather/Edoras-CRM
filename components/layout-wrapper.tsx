"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useRouter } from "@/lib/navigation";
import { Header } from "@/components/header";
import { Sidebar } from "@/components/sidebar";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/features/auth";
import { useSidebarStore } from "@/lib/stores/sidebar";
import { isPublicPath } from "@/lib/permissions";

/**
 * Rol koruması: CRM_AGENT izinli olmayan bir yola gelirse (doğrudan URL, eski yer imi) ana sayfasına
 * yönlenir; yönlenene kadar sayfa içeriği hiç çizilmez. Yalnız arayüz koruması — uçlar 403 verir.
 * Oturum koruması proxy.ts'te (oturumsuz istek /login'e gider) ve API istemcisinde (401 → /login).
 */
function useRouteGuard(pathname: string | null | undefined) {
  const router = useRouter();
  const { isLoading, canAccessPath, homePath } = usePermissions();
  const blocked = !isLoading && !!pathname && !canAccessPath(pathname);

  useEffect(() => {
    if (blocked) router.replace(homePath);
  }, [blocked, homePath, router]);

  return blocked;
}

export function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Giriş sayfası ve müşteriye açık anket sayfası (/s/*): panel kabuğu yok, oturum/rol hook'ları çalışmaz.
  if (isPublicPath(pathname)) return <>{children}</>;
  return <PanelShell pathname={pathname}>{children}</PanelShell>;
}

function PanelShell({ pathname, children }: { pathname: string | null | undefined; children: React.ReactNode }) {
  const sidebarExpanded = useSidebarStore((s) => s.expanded);
  const blocked = useRouteGuard(pathname);

  return (
    <div className="min-h-screen flex vision-app">
      <Sidebar />
      <main
        className={cn(
          "flex-1 flex flex-col min-h-screen overflow-hidden relative transition-[margin] duration-300",
          sidebarExpanded ? "md:ml-72" : "md:ml-28"
        )}
      >
        <Suspense fallback={null}>
          <Header />
        </Suspense>
        <div className="flex-1 overflow-y-auto relative z-10">{blocked ? null : children}</div>
      </main>
    </div>
  );
}
