"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

interface LoginLogoProps {
  className?: string;
  width?: number;
  height?: number;
}

/** Giriş ekranı logosu — Edoras logosu kendi karosunu taşıdığı için tema fark etmez. */
export function LoginLogo({ className, width = 64, height = 64 }: LoginLogoProps) {
  const t = useTranslations("app");
  return (
    <div className={cn("relative", className)} style={{ width, height }}>
      <Image src="/logo.png" alt={t("name")} fill sizes={`${width}px`} className="object-contain" priority />
    </div>
  );
}
