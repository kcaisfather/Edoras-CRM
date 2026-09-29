"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { InactivityTone } from "@/lib/utils/customer-signals";
import type { Dissatisfaction, ProgramTag } from "@/lib/domain/crm-notes/utils";
import type { CrmStatus } from "@/lib/domain/crm/types";
import { getCrmStatusBadgeClass } from "@/lib/domain/crm/utils";

const TONE_CLASS: Record<InactivityTone, string> = {
  green: "bg-success/10 text-success border-success/25",
  yellow: "bg-warning/10 text-warning border-warning/25",
  orange: "bg-caution/10 text-caution border-caution/25",
  red: "bg-destructive/10 text-destructive border-destructive/25",
  gray: "bg-muted text-muted-foreground border-border",
};

export function ToneBadge({
  tone,
  children,
  title,
  className,
}: {
  tone: InactivityTone;
  children: React.ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums",
        TONE_CLASS[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

/** Açık şikâyet kaydı rozeti (çözülmüşse çizilmez). */
export function DissatisfiedBadge({ value }: { value: Dissatisfaction | null | undefined }) {
  const t = useTranslations("crm.dissatisfied");
  if (!value || value.status !== "acik") return null;
  return (
    <ToneBadge tone="red" title={value.description || undefined}>
      {t("badge")} · {t(`severity.${value.severity}`)}
    </ToneBadge>
  );
}

/** Erken yenileme / yıllık ön ödeme etiketleri (G113). */
export function ProgramBadges({ tags }: { tags: ProgramTag[] | undefined }) {
  const t = useTranslations("crm.program");
  if (!tags?.length) return null;
  return (
    <>
      {tags.map((tag) => (
        <ToneBadge key={tag} tone="green">
          {t(tag)}
        </ToneBadge>
      ))}
    </>
  );
}

/** Satış aşaması rozeti. */
export function StatusBadge({ status }: { status: CrmStatus | null | undefined }) {
  const t = useTranslations("crm.status");
  if (!status) return <span className="text-muted-foreground">-</span>;
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        getCrmStatusBadgeClass(status)
      )}
    >
      {t(status)}
    </span>
  );
}
