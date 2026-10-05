"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { useTranslations } from "next-intl"

import { cn } from "@/lib/utils"

/**
 * Sağdan açılan panel — kurucu kararı (2026-10-05): "Her şey sağdan, modern bir panel görünümünde açılmalı."
 * API `Dialog` ile aynı (SidePanel / Content / Header / Title / Description / Footer), böylece bir pencere yalnız
 * import değiştirilerek panele çevrilir. Masaüstünde kenarlardan boşluklu, yuvarlak köşeli yüzen kart; telefonda tam
 * ekran. Başlık üstte, alt düğmeler altta yapışık kalır; aradaki içerik kayar. Kısa onay pencereleri (Sil, Vazgeç)
 * ortadaki `Dialog`'da kalır.
 */

const SidePanel = DialogPrimitive.Root
const SidePanelTrigger = DialogPrimitive.Trigger
const SidePanelClose = DialogPrimitive.Close

/** Yüzen panel yüzeyi; kendi iç düzenini kuran paneller (aday paneli) de `SheetContent`'e bunu verir. */
export const SIDE_PANEL_SURFACE =
  "inset-y-0 right-0 h-full w-full border-l sm:inset-y-3 sm:right-3 sm:h-auto sm:rounded-2xl sm:border"

const SIZES = {
  md: "sm:max-w-md",
  lg: "sm:max-w-lg",
  xl: "sm:max-w-xl",
  "2xl": "sm:max-w-2xl",
} as const

const SidePanelContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { size?: keyof typeof SIZES }
>(({ className, children, size = "lg", ...props }, ref) => {
  const tCommon = useTranslations("common")
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-background/60 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed z-50 flex flex-col overflow-y-auto overscroll-contain border-border bg-card px-5 text-card-foreground shadow-2xl",
          "transition ease-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-200 data-[state=open]:duration-300",
          "data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
          SIDE_PANEL_SURFACE,
          SIZES[size],
          className
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute right-4 top-4 z-20 cursor-pointer rounded-full p-1 opacity-70 ring-offset-background transition hover:bg-muted hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
          <X className="h-4 w-4" />
          <span className="sr-only">{tCommon("close")}</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
})
SidePanelContent.displayName = "SidePanelContent"

/** Üstte yapışık başlık (kayan içeriğin üstünde kalır). */
const SidePanelHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "sticky top-0 z-10 -mx-5 mb-4 flex flex-col space-y-1 border-b border-border bg-card/95 px-5 pb-3 pr-12 pt-5 text-left backdrop-blur",
      className
    )}
    {...props}
  />
)
SidePanelHeader.displayName = "SidePanelHeader"

/** Altta yapışık düğme satırı. */
const SidePanelFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "sticky bottom-0 z-10 -mx-5 mt-4 flex flex-col-reverse gap-2 border-t border-border bg-card/95 px-5 py-3 backdrop-blur sm:flex-row sm:justify-end",
      className
    )}
    {...props}
  />
)
SidePanelFooter.displayName = "SidePanelFooter"

const SidePanelTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn("text-lg font-semibold leading-tight text-foreground", className)} {...props} />
))
SidePanelTitle.displayName = "SidePanelTitle"

const SidePanelDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
))
SidePanelDescription.displayName = "SidePanelDescription"

export {
  SidePanel,
  SidePanelTrigger,
  SidePanelClose,
  SidePanelContent,
  SidePanelHeader,
  SidePanelFooter,
  SidePanelTitle,
  SidePanelDescription,
}
