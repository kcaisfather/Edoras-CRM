"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { institutionStatus, type InstitutionStatusInfo } from "@/lib/domain/institutions/status";
import { todayIso } from "@/lib/domain/institutions/rules";
import type { InstitutionListItem } from "@/lib/domain/institutions/types";

const TONE: Record<string, string> = {
  DEMO: "bg-primary/10 text-primary border-primary/25",
  DEMO_BITTI: "bg-warning/10 text-warning border-warning/30",
  UCRETLI: "bg-success/10 text-success border-success/25",
  UCRETLI_SOON: "bg-caution/10 text-caution border-caution/30",
  LISANS_BITTI: "bg-destructive/10 text-destructive border-destructive/25",
  KAYITSIZ: "bg-muted text-muted-foreground border-border",
  PASIF: "bg-muted text-muted-foreground border-border",
  EDORAS_YOK: "bg-warning/10 text-warning border-warning/30",
};

/** Durum metni: "Demo · 5 gün kaldı", "Demo bitti · 3 gün önce", "Ücretli · 12 gün kaldı"… */
export function useStatusLabel() {
  const t = useTranslations("institutions.status");
  return (info: InstitutionStatusInfo): string => {
    const d = info.daysLeft;
    switch (info.state) {
      case "DEMO":
        return d == null ? t("demo") : t("demoDaysLeft", { days: d });
      case "DEMO_BITTI":
        return d == null || d === 0 ? t("demoEndedToday") : t("demoEnded", { days: -d });
      case "UCRETLI":
        return info.licenseSoon && d != null ? t("paidDaysLeft", { days: d }) : t("paid");
      case "LISANS_BITTI":
        return d == null || d === 0 ? t("licenseEndedToday") : t("licenseEnded", { days: -d });
      case "KAYITSIZ":
        return t("unregistered");
      case "PASIF":
        return t("inactive");
      case "EDORAS_YOK":
        return t("missingInEdoras");
    }
  };
}

/** Hazır durum bilgisinden rozet (kurum satırı olmayan ekranlar için — ör. müşteri analizleri). */
export function InstitutionInfoBadge({ info, className }: { info: InstitutionStatusInfo; className?: string }) {
  const label = useStatusLabel()(info);
  const tone = info.state === "UCRETLI" && info.licenseSoon ? TONE.UCRETLI_SOON : TONE[info.state];
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        tone,
        className
      )}
    >
      {label}
    </span>
  );
}

export function InstitutionStatusBadge({
  item,
  today,
  className,
}: {
  item: Pick<InstitutionListItem, "isActive" | "crm" | "licenseEndsOn" | "missingInEdoras">;
  today?: string;
  className?: string;
}) {
  return <InstitutionInfoBadge info={institutionStatus(item, today ?? todayIso())} className={className} />;
}
