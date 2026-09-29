"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  width?: number;
  height?: number;
}

/**
 * Edoras marka logosu (teal yuvarlak kare + yıldız). Logonun kendisi karo olduğu için ayrı bir
 * renkli zemine konmaz; açık ve koyu temada aynı görünür.
 */
export function Logo({ className, width = 40, height = 40 }: LogoProps) {
  const t = useTranslations("app");

  return (
    <div className={cn("relative", className)} style={{ width, height }}>
      <Image src="/logo.png" alt={t("name")} fill sizes={`${width}px`} className="object-contain" priority />
    </div>
  );
}
