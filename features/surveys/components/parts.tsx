"use client";

import { toast } from "sonner";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/utils";
import type { NpsCategory } from "@/lib/domain/surveys/logic";
import type { SurveyInvitationStatus } from "@/lib/domain/surveys/types";

/** Anket ekranlarının ortak küçük parçaları (DeepSport SurveysPage'den ayrıldı; dosya boyu sınırı). */

export const STATUS_TONE: Record<SurveyInvitationStatus, string> = {
  CREATED: "bg-muted text-muted-foreground border-border",
  SENT: "bg-primary/10 text-primary border-primary/25",
  OPENED: "bg-category-2/10 text-category-2 border-category-2/25",
  RESPONDED: "bg-success/10 text-success border-success/25",
  EXPIRED: "bg-muted text-muted-foreground border-border",
  FAILED: "bg-destructive/10 text-destructive border-destructive/25",
};

export const NPS_TONE: Record<NpsCategory, string> = {
  promoter: "text-success",
  passive: "text-warning",
  detractor: "text-destructive",
};

export function Kpi({ label, value, hint, info }: { label: string; value: React.ReactNode; hint?: string; info?: string }) {
  return (
    <div className="glass-panel rounded-2xl p-4">
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        {label}
        {info && <InfoTip label={label}>{info}</InfoTip>}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Pill({ className, children }: { className?: string; children: React.ReactNode }) {
  return <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", className)}>{children}</span>;
}

/** Panoya kopyalar ve sonucu bildirir. */
export async function copyText(text: string, okMsg: string, failMsg: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(okMsg);
  } catch {
    toast.error(failMsg);
  }
}
