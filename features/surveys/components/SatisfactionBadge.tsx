"use client";

import { useTranslations } from "next-intl";
import { MessageCircle } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatCrmDate } from "@/lib/domain/crm/utils";
import { satisfactionLevel, type SatisfactionLevel } from "@/lib/domain/surveys/logic";
import { buildSurveyReminder } from "@/lib/domain/surveys/message";
import type { SurveySatisfaction } from "@/lib/domain/surveys/types";
import { useLeadSatisfaction } from "../queries";
import { appOrigin } from "../recipients";

const TONE: Record<SatisfactionLevel, string> = {
  good: "bg-success/10 text-success border-success/25",
  neutral: "bg-warning/10 text-warning border-warning/25",
  bad: "bg-destructive/10 text-destructive border-destructive/25",
};

type SubjectIds = { leadId?: string | null; institutionId?: string | null };

/** Özetten rozet: yanıt varsa seviye + puanlar; yoksa (showEmpty) "yanıt bekliyor" / "yanıt yok"; hiç veri yoksa hiçbir şey. */
export function SatisfactionPill({
  data,
  className,
  showEmpty = false,
}: {
  data: SurveySatisfaction | null | undefined;
  className?: string;
  showEmpty?: boolean;
}) {
  const t = useTranslations("surveys.badge");
  const level = data ? satisfactionLevel(data.lastNps, data.lastCsat) : null;

  if (!data || !level) {
    if (!showEmpty || !data) return null;
    return (
      <span className={cn("inline-flex shrink-0 items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground", className)}>
        {data.pendingInvitation ? t("pending") : t("none")}
      </span>
    );
  }

  const parts = [data.lastNps != null ? `NPS ${data.lastNps}` : null, data.lastCsat != null ? `${data.lastCsat}/5` : null].filter(Boolean);
  return (
    <span
      className={cn("inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", TONE[level], className)}
      title={t("title", { date: formatCrmDate(data.lastResponseAt), count: data.responseCount })}
    >
      {t(`levels.${level}`)}
      <span className="font-normal opacity-80 tabular-nums">· {parts.join(" · ")}</span>
    </span>
  );
}

/**
 * Salt okunur memnuniyet rozeti — yalnızca müşterinin anket yanıtından (madde 7). Aday ve bağlı kurumu birlikte
 * değerlendirilir; tüm liste tek istekle okunur (paylaşılan dizin). Yanıt yoksa ya da yükleniyorsa hiçbir şey çizmez.
 * Kullanım: `<SatisfactionBadge leadId={lead.id} institutionId={lead.institutionId} />` (CRM satırı, mobil kart, detay).
 */
export function SatisfactionBadge({ className, showEmpty = false, ...ids }: SubjectIds & { className?: string; showEmpty?: boolean }) {
  const { data } = useLeadSatisfaction(ids);
  return <SatisfactionPill data={data} className={className} showEmpty={showEmpty} />;
}

/**
 * "Anket araması": kişinin yanıtlanmamış daveti varsa WhatsApp ile tekrar gönderme düğmesi (panel yalnızca wa.me
 * linkini açar; mesajı kullanıcı gönderir — üretim yazması yok).
 */
export function SurveyReminderButton({
  phone,
  name,
  className,
  ...ids
}: SubjectIds & { phone: string | null | undefined; name?: string | null; className?: string }) {
  const t = useTranslations("surveys.badge");
  const { data } = useLeadSatisfaction(ids);
  const token = data?.pendingInvitation?.token;
  if (!token || typeof window === "undefined") return null;
  const { whatsappUrl } = buildSurveyReminder({ origin: appOrigin(), token, name, phone, kind: "reminder" });
  if (!whatsappUrl) return null;
  return (
    <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "sm", className })}>
      <MessageCircle />
      {t("resendWhatsapp")}
    </a>
  );
}
