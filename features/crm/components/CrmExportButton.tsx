"use client";

import { useTranslations } from "next-intl";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/features/auth";
import { formatPhone } from "@/features/institutions";
import { downloadCsv } from "@/lib/utils/csv";
import type { CrmLead } from "@/lib/domain/crm/types";
import { getContactName, getRemainingAmount } from "@/lib/domain/crm/utils";

/**
 * Aday listesinin CSV'si (G29): çağrı anında `getLeads` ile alınan kayıtlar (ekrandaki süzgecin tamamı).
 * EK-3: CRM_AGENT dosyasında teklif / satış / tahsilat / kalan sütunları yer almaz (değerler zaten sunucudan boş gelir).
 */
export function CrmExportButton({
  getLeads,
  filename = "adaylar",
  disabled,
}: {
  getLeads: () => CrmLead[];
  filename?: string;
  disabled?: boolean;
}) {
  const t = useTranslations("crm.export");
  const tStatus = useTranslations("crm.status");
  const tSource = useTranslations("crm.source");
  const tOffer = useTranslations("crm.offer");
  const { canSeeFinancials } = usePermissions();

  const onExport = () => {
    const rows = getLeads().map((l) => [
      l.organizationName,
      getContactName(l),
      l.contactEmail,
      l.contactPhone ? formatPhone(l.contactPhone) : null,
      l.city,
      l.district,
      l.status ? tStatus(l.status) : "",
      l.source ? tSource(l.source) : "",
      l.createdAt ? new Date(l.createdAt).toISOString().slice(0, 10) : "",
      l.nextFollowUpAt,
      l.lostReason ? tOffer(`reasons.${l.lostReason}`) : "",
      l.institutionId ? (l.institution?.name ?? t("yes")) : t("no"),
      ...(canSeeFinancials
        ? [l.offerAmount, l.saleAmount, l.collectedAmount, l.saleAmount ? getRemainingAmount(l.saleAmount, l.collectedAmount) : null]
        : []),
    ]);
    downloadCsv(
      filename,
      [
        t("h.organization"),
        t("h.contact"),
        t("h.email"),
        t("h.phone"),
        t("h.city"),
        t("h.district"),
        t("h.status"),
        t("h.source"),
        t("h.created"),
        t("h.nextCall"),
        t("h.lostReason"),
        t("h.institution"),
        ...(canSeeFinancials ? [t("h.offer"), t("h.sale"), t("h.collected"), t("h.remaining")] : []),
      ],
      rows
    );
  };

  return (
    <Button size="sm" variant="outline" onClick={onExport} disabled={disabled}>
      <Download />
      {t("button")}
    </Button>
  );
}
