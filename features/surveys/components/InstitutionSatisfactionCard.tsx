"use client";

import { useTranslations } from "next-intl";
import { ExternalLink, MessageSquareHeart } from "lucide-react";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/lib/navigation";
import { formatCrmDate } from "@/lib/domain/crm/utils";
import { useSubjectSatisfaction } from "../queries";
import { SatisfactionPill } from "./SatisfactionBadge";

/**
 * Kurum ayrıntısındaki memnuniyet kartı (DeepSport profil başlığındaki SatisfactionBadge karşılığı): son yanıtın
 * seviyesi ve puanları, yanıt sayısı, yanıt bekleyen davet. Hiç davet / yanıt yoksa çizilmez. Kurum sayfası bu kartı
 * route dosyasında `aside` ile alır (kurumlar modülü anketleri import etmez).
 */
export function InstitutionSatisfactionCard({ institutionId }: { institutionId: string }) {
  const t = useTranslations("surveys.institutionCard");
  const query = useSubjectSatisfaction({ institutionId });

  if (query.isLoading) return <Skeleton className="h-24 w-full rounded-2xl" />;
  if (query.isError) return <p className="rounded-2xl border border-border bg-card/60 p-4 text-xs text-muted-foreground">{t("error")}</p>;
  const data = query.data;
  if (!data || (data.responseCount === 0 && !data.pendingInvitation)) return null;

  return (
    <Card className="glass-panel rounded-2xl border-border/50 p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold leading-tight">
          <MessageSquareHeart className="h-5 w-5 text-primary" />
          {t("title")}
        </h2>
        <Link href="/crm/surveys" className={buttonVariants({ size: "sm", variant: "outline" })}>
          <ExternalLink />
          {t("open")}
        </Link>
      </div>
      <div className="space-y-1.5 text-sm">
        <SatisfactionPill data={data} showEmpty />
        {data.lastResponseAt != null && (
          <p className="text-xs text-muted-foreground">{t("last", { date: formatCrmDate(data.lastResponseAt), count: data.responseCount })}</p>
        )}
        {data.pendingInvitation?.sentAt != null && (
          <p className="text-xs text-muted-foreground">{t("pendingSince", { date: formatCrmDate(data.pendingInvitation.sentAt) })}</p>
        )}
      </div>
    </Card>
  );
}
