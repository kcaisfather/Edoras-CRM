"use client";

/**
 * Aday satırının, mobil kartının ve aday panelinin ortak küçük parçaları: tıklama kalkanı, bağlı kurum işareti,
 * "Müşteri" rozeti ve "Anket gönder" / "Fatura kes" koşulları + panel düğmeleri.
 */
import { useTranslations } from "next-intl";
import { Building2, FileText, HeartHandshake, MessageSquareHeart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@/lib/navigation";
import { usePermissions } from "@/features/auth";
import type { CrmLead } from "@/lib/domain/crm/types";
import type { CrmTableActions } from "../types";

/** Satır içindeki düğme/menü tıklamaları satırı (aday panelini) açmasın. */
export const stop = (e: React.SyntheticEvent) => e.stopPropagation();

/**
 * "Anket gönder" (anketler modülü `onSendSurvey` verirse): adayın ya da bağlı kurum yetkilisinin e-postası / telefonu
 * varsa (DeepSport: iletişimi olan lead).
 */
export function canSendSurvey(lead: CrmLead, actions: Partial<CrmTableActions>): boolean {
  const crm = lead.institution?.crm;
  return !!actions.onSendSurvey && !!(lead.contactEmail || lead.contactPhone || crm?.contactEmail || crm?.contactPhone);
}

/**
 * "Fatura kes" (faturalar modülü `onIssueInvoice` verirse): yalnız finans yetkisiyle ve ücretli kuruma bağlı adayda
 * (fatura kurumun lisansı / ödemesi içindir).
 */
export function canIssueInvoice(lead: CrmLead, actions: Partial<CrmTableActions>, canSeeFinancials: boolean): boolean {
  return !!actions.onIssueInvoice && canSeeFinancials && !!lead.institutionId && lead.institution?.crm?.status === "UCRETLI";
}

/** Aday panelinin eylem satırındaki "Anket gönder" düğmesi. */
export function SendSurveyButton({ lead, actions }: { lead: CrmLead; actions: Partial<CrmTableActions> }) {
  const t = useTranslations("crm.list");
  if (!canSendSurvey(lead, actions)) return null;
  return (
    <Button size="sm" variant="outline" onClick={() => actions.onSendSurvey?.(lead)}>
      <MessageSquareHeart />
      {t("sendSurvey")}
    </Button>
  );
}

/** Aday panelindeki "Fatura kes" düğmesi (alım-satım geçmişi). */
export function IssueInvoiceButton({ lead, actions }: { lead: CrmLead; actions: Partial<CrmTableActions> }) {
  const t = useTranslations("crm.list");
  const { canSeeFinancials } = usePermissions();
  if (!canIssueInvoice(lead, actions, canSeeFinancials)) return null;
  return (
    <Button size="sm" variant="outline" onClick={() => actions.onIssueInvoice?.(lead)}>
      <FileText />
      {t("issueInvoice")}
    </Button>
  );
}

/** Edoras kurumuna bağlı aday işareti (başlıkta kurum adı). */
export function LinkedMark({ lead }: { lead: CrmLead }) {
  const t = useTranslations("crm.list");
  if (!lead.institutionId) return null;
  const label = lead.institution?.name ? t("linkedHint", { name: lead.institution.name }) : t("linkedUnknown");
  return (
    <span title={label} className="inline-flex shrink-0">
      <Building2 className="h-3.5 w-3.5 text-primary" aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** Satış olmuş aday: "Müşteri" rozeti → bağlı kurumun sayfası (satır tıklamasını tetiklemez). */
export function CustomerBadge({ lead }: { lead: CrmLead }) {
  const t = useTranslations("crm.list");
  if (lead.status !== "SATIS_OLDU") return null;
  const className =
    "inline-flex shrink-0 items-center gap-1 rounded-full border border-success/30 bg-success/10 px-1.5 py-0.5 text-[11px] font-medium text-success";
  const content = (
    <>
      <HeartHandshake className="h-3 w-3" aria-hidden />
      {t("customerBadge")}
    </>
  );
  if (!lead.institutionId) return <span className={className}>{content}</span>;
  return (
    <Link
      href={`/institutions/${lead.institutionId}`}
      onClick={stop}
      onKeyDown={stop}
      title={t("customerBadgeHint")}
      className={`${className} hover:underline`}
    >
      {content}
    </Link>
  );
}
