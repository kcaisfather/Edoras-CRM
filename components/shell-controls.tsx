"use client";

import { useTranslations } from "next-intl";
import { CommandPalette } from "@/components/command-palette";
import { ModeToggle } from "@/components/mode-toggle";
import { NotificationBell } from "@/features/notifications";
import { cn } from "@/lib/utils";

/**
 * Genel kontroller (arama/Cmd+K, bildirimler, tema) — kenar çubuğunun altında, Profil kartının hemen altında. Açık
 * kenar çubuğunda yatay satır, daraltılmışta dikey ikon yığını. Menüler kırpılmasın diye yukarı (satır)
 * ya da sağa (yığın) açılır. (Dil seçici yok: panel yalnız Türkçe.) Bildirim zili: gecikmiş görev, yaklaşan randevu, yeni anket yanıtı, biten lisans.
 */
export function ShellControls({
  orientation = "row",
  shortcut = true,
  className,
}: {
  orientation?: "row" | "column";
  /** Cmd/Ctrl+K kısayolu yalnız bir kopyada dinlenir (mobil menüdeki kopya false). */
  shortcut?: boolean;
  className?: string;
}) {
  const t = useTranslations("navigation");
  const column = orientation === "column";
  const side = column ? "right" : "top";
  const align = column ? "end" : "start";
  return (
    <div
      role="toolbar"
      aria-label={t("shellControls")}
      aria-orientation={column ? "vertical" : "horizontal"}
      className={cn(column ? "flex flex-col items-center gap-1" : "flex items-center justify-between gap-1 px-1", className)}
    >
      <CommandPalette shortcut={shortcut} />
      <NotificationBell size="icon-sm" side={side} align={align} />
      <ModeToggle size="icon-sm" className="text-muted-foreground" side={side} align={align} />
    </div>
  );
}
