"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Küçük "ⓘ" ipucu: fareyle üzerine gelince, klavyeyle odaklanınca ya da dokununca açılır.
 * Kütüphanesiz; metrik tanımları gibi kısa açıklamalar için. `trigger` verilirse simge yerine o (ör. tablo sütun
 * başlığı) noktalı alt çizgiyle tetikleyici olur — başlığın üzerine gelince açıklama açılır.
 */
export function InfoTip({
  children,
  label,
  className,
  align = "center",
  trigger,
}: {
  children: React.ReactNode;
  /** Ekran okuyucu adı (ör. "Aktif hesap tanımı"). */
  label?: string;
  className?: string;
  align?: "start" | "center" | "end";
  /** Simge yerine gösterilecek tetikleyici (ör. sütun başlığı metni). */
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const t = useTranslations("shell.infoTip");

  return (
    <span
      className={cn("relative inline-flex align-middle", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={label ?? t("label")}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        className={
          trigger
            ? "cursor-help rounded-sm underline decoration-dotted decoration-muted-foreground/60 underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            : "inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        }
      >
        {trigger ?? <Info className="h-3.5 w-3.5" aria-hidden />}
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className={cn(
            "absolute top-full z-50 mt-1.5 w-64 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-popover px-3 py-2 whitespace-normal text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-popover-foreground shadow-lg",
            align === "start" && "left-0",
            align === "center" && "left-1/2 -translate-x-1/2",
            align === "end" && "right-0"
          )}
        >
          {children}
        </span>
      )}
    </span>
  );
}
