"use client";

import { useTranslations } from "next-intl";
import { ClipboardList, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/lib/navigation";
import { useLeadNotes } from "@/features/crm-notes";
import { parseNoteContent } from "@/lib/domain/crm-notes/utils";
import type { CrmLeadDto } from "@/lib/domain/crm/types";
import { formatCrmDate, getContactName } from "@/lib/domain/crm/utils";
import { useLeadForInstitution } from "../queries";
import { DissatisfiedBadge, StatusBadge } from "./CrmBadges";

const NOTE_LIMIT = 3;

/**
 * Kurum ayrıntısındaki "CRM adayı" kartı: kuruma bağlı aday varsa statüsü, sonraki arama ve son notları;
 * "Adaylar'da aç" adayın detay penceresini açar. Aday yoksa hiçbir şey çizmez. Kurum sayfası bu kartı
 * route dosyasında alır (kurumlar modülü CRM'i import etmez).
 */
export function InstitutionLeadCard({ institutionId }: { institutionId: string }) {
  const t = useTranslations("crm.institutionCard");
  const query = useLeadForInstitution(institutionId);

  if (query.isLoading) return <Skeleton className="h-32 w-full rounded-2xl" />;
  if (query.isError) return <p className="rounded-2xl border border-border bg-card/60 p-4 text-xs text-muted-foreground">{t("error")}</p>;
  const lead = query.data;
  if (!lead) return null;

  const contact = getContactName(lead);
  return (
    <Card className="glass-panel rounded-2xl border-border/50 p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold leading-tight">
          <ClipboardList className="h-5 w-5 text-primary" />
          {t("title")}
        </h2>
        <Link href={`/crm?lead=${lead.id}`} className={buttonVariants({ size: "sm", variant: "outline" })}>
          <ExternalLink />
          {t("open")}
        </Link>
      </div>
      <div className="space-y-1.5 text-sm">
        <p className="flex flex-wrap items-center gap-2">
          <StatusBadge status={lead.status} />
          <DissatisfiedBadge value={lead.dissatisfaction} />
        </p>
        {contact && <p className="text-muted-foreground">{contact}</p>}
        {lead.nextFollowUpAt && <p className="text-xs text-muted-foreground">{t("nextCall", { date: formatCrmDate(lead.nextFollowUpAt) })}</p>}
      </div>
      <LatestNotes lead={lead} />
    </Card>
  );
}

function LatestNotes({ lead }: { lead: CrmLeadDto }) {
  const t = useTranslations("crm.institutionCard");
  const tTag = useTranslations("crm.notes.tag");
  const notes = useLeadNotes(lead.id);
  const list = (notes.data ?? []).slice(0, NOTE_LIMIT);
  return (
    <div className="mt-4 space-y-2">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t("notes")}</p>
      {notes.isLoading ? (
        <Skeleton className="h-10 w-full rounded-lg" />
      ) : list.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("noNotes")}</p>
      ) : (
        <ul className="space-y-2">
          {list.map((n) => {
            const parsed = parseNoteContent(n.content);
            return (
              <li key={n.id} className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs">
                <p className="text-muted-foreground">
                  {formatCrmDate(n.createdAt)}
                  {n.authorName ? ` · ${n.authorName}` : ""}
                  {parsed.tag ? ` · ${tTag(parsed.tag)}` : ""}
                </p>
                <p className="line-clamp-3 whitespace-pre-wrap break-words">{parsed.body || "—"}</p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
