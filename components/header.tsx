"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/lib/navigation";
import { MobileSidebar } from "@/components/mobile-sidebar";
import { Menu, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Yalnız küçük ekranda menü düğmesi. Genel kontroller (arama, tema) kenar çubuğunda
 * (masaüstü: Profil kartının altı; mobil: menü panelinin altı).
 */
function MobileMenuButton({ onClick }: { onClick: () => void }) {
  const tNav = useTranslations("navigation");
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="shrink-0 rounded-full text-muted-foreground md:hidden"
      onClick={onClick}
      aria-label={tNav("menu")}
      title={tNav("menu")}
    >
      <Menu />
    </Button>
  );
}

/** Ayrıntı sayfalarının kısa geri bağlantısı ("← Kurumlara dön / Kurum"). */
function Breadcrumb({ href, back, title }: { href: string; back: string; title: string }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
      <Link
        href={href}
        className="flex shrink-0 items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {back}
      </Link>
      <span className="shrink-0 text-muted-foreground/60">/</span>
      <span className="truncate font-light tracking-tight text-foreground">{title}</span>
    </div>
  );
}

/**
 * Sayfa başlık/alt başlık bloğu yok (belge başlığı sayfaların metadata'sında). Üst alan yalnız sayfanın kendi
 * kontrollerini taşır — ayrıntı sayfaları: geri bağlantısı. Kontrolü olmayan sayfalarda masaüstünde hiçbir şey
 * çizilmez, mobilde ince bir menü çubuğu kalır.
 */
export function Header() {
  const t = useTranslations("institutions.detail");
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const openMenu = () => setMobileMenuOpen(true);

  const isDetail = (base: string) => !!pathname?.startsWith(`${base}/`) && pathname.length > base.length + 1;

  let controls: React.ReactNode = null;
  if (isDetail("/institutions")) {
    controls = <Breadcrumb href="/institutions" back={t("back")} title={t("title")} />;
  }

  return (
    <>
      {controls ? (
        <header className="z-20 flex flex-wrap items-center gap-3 px-4 pt-4 md:px-8 md:pt-6">
          <MobileMenuButton onClick={openMenu} />
          {controls}
        </header>
      ) : (
        <header className="flex px-4 pt-3 md:hidden">
          <MobileMenuButton onClick={openMenu} />
        </header>
      )}
      <MobileSidebar open={mobileMenuOpen} onOpenChange={setMobileMenuOpen} />
    </>
  );
}
