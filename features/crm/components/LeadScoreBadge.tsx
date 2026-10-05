"use client";

/**
 * Lead skoru rozeti (0–100): sıcak / ılık / soğuk rengi, ipucunda puanın nedenleri. Satışı yapılmış ve olumsuz adaylar
 * puanlanmaz ("—"). Hesap: lib/domain/crm/score.ts (yalnız aday alanlarından; tutar kullanılmaz).
 */
import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { leadScore, type ScoreTier } from "@/lib/domain/crm/score";
import type { CrmLead } from "@/lib/domain/crm/types";

const TIER_CLASS: Record<ScoreTier, string> = {
  hot: "border-success/30 bg-success/10 text-success",
  warm: "border-warning/30 bg-warning/10 text-warning",
  cold: "border-border bg-muted/50 text-muted-foreground",
};

export function LeadScoreBadge({ lead, className }: { lead: CrmLead; className?: string }) {
  const t = useTranslations("crm.score");
  const s = useMemo(() => leadScore(lead), [lead]);
  if (!s) return <span className="text-muted-foreground">—</span>;

  const reasons = s.parts.filter((p) => p.points !== 0).map((p) => `${t(`parts.${p.key}`)}: ${p.points > 0 ? "+" : ""}${p.points}`);
  if (s.followUpOverdue) reasons.push(t("followUpOverdue"));
  return (
    <span
      className={cn("inline-flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums", TIER_CLASS[s.tier], className)}
      title={`${t(`tiers.${s.tier}`)} · ${reasons.join(" · ")}`}
      aria-label={t("aria", { score: s.score, tier: t(`tiers.${s.tier}`) })}
    >
      {s.score}
      <span className="font-normal opacity-80">{t(`tiers.${s.tier}`)}</span>
    </span>
  );
}
