"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export function EmptyRow({ colSpan }: { colSpan: number }) {
  const t = useTranslations("list");
  return (
    <tr>
      <td colSpan={colSpan} className="py-10 text-center text-sm text-muted-foreground">
        {t("empty")}
      </td>
    </tr>
  );
}

/** Dar ekranda tablo yerine gösterilen kart listesi (md ve üstünde gizli). */
export function MobileCardList({ empty, children }: { empty: boolean; children: React.ReactNode }) {
  const t = useTranslations("list");
  return (
    <div className="space-y-3 md:hidden">
      {empty ? <p className="py-8 text-center text-sm text-muted-foreground">{t("empty")}</p> : children}
    </div>
  );
}

export function MobileCard({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("glass-panel rounded-2xl p-4 space-y-3", className)}>{children}</div>;
}

/** Tablo sarmalayıcı: dar ekranda gizli (kartlar gösterilir). */
export function DesktopTable({ children }: { children: React.ReactNode }) {
  return (
    <div className="hidden md:block overflow-hidden rounded-2xl border border-border/60 bg-card/60">
      <div className="w-full overflow-x-auto">{children}</div>
    </div>
  );
}
