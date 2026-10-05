"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, GitMerge, Link2, Pencil, RotateCcw } from "lucide-react";
import { Link } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/features/auth";
import { formatPhone } from "@/features/institutions";
import { useApiErrorMessage } from "@/lib/hooks/use-api-error-message";
import { findDuplicateGroups, type DupGroup, type DupInstitution, type DupRecord } from "@/lib/domain/crm/insights";
import type { CrmLead } from "@/lib/domain/crm/types";
import { formatCrmDate, getLeadDisplayName } from "@/lib/domain/crm/utils";
import type { InstitutionListItem } from "@/lib/domain/institutions/types";
import { useLinkLead } from "../mutations";
import { StatusBadge, ToneBadge } from "./CrmBadges";
import { CrmMergeDialog } from "./CrmMergeDialog";

/**
 * Olası mükerrer kayıtlar (G60): adaylar ve adaya bağlı olmayan Edoras kurumları arasında normalize e-posta /
 * telefon / ad eşleşmeleri, yan yana. Otomatik birleştirme yok; aday düzenleme penceresinden düzeltilir.
 * Grupta tek bağsız aday ve bir kurum varsa aday tek tıkla o kuruma bağlanabilir.
 */
export function CrmDuplicates({
  leads,
  institutions,
  isLoading,
  institutionsError,
  onRetryInstitutions,
  onEdit,
}: {
  leads: CrmLead[];
  institutions: InstitutionListItem[] | undefined;
  isLoading?: boolean;
  institutionsError?: boolean;
  onRetryInstitutions?: () => void;
  onEdit: (lead: CrmLead) => void;
}) {
  const t = useTranslations("crm.duplicates");
  const tCommon = useTranslations("common");

  const groups = useMemo(() => {
    if (isLoading) return [];
    const candidates: DupInstitution[] = (institutions ?? [])
      .filter((i) => !i.isInternal && !i.missingInEdoras)
      .map((i) => ({
        id: i.id,
        name: i.name,
        contactName: i.crm?.contactName ?? null,
        email: i.crm?.contactEmail ?? null,
        phone: i.crm?.contactPhone ?? null,
        createdAt: i.createdAt,
      }));
    return findDuplicateGroups(leads, candidates);
  }, [leads, institutions, isLoading]);

  if (isLoading) return <Skeleton className="h-48 w-full rounded-2xl" />;

  return (
    <div className="space-y-3">
      {institutionsError && (
        // Kurumlar okunamazsa yalnız adaylar karşılaştırılır — bunu açıkça söyle.
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">{t("institutionsError")}</span>
          {onRetryInstitutions && (
            <Button variant="outline" size="sm" className="h-6 px-2" onClick={onRetryInstitutions}>
              <RotateCcw />
              {tCommon("retry")}
            </Button>
          )}
        </div>
      )}
      <p className="text-sm text-muted-foreground">{t("count", { count: groups.length })}</p>
      {groups.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="space-y-3">
          {groups.map((g, gi) => (
            <li key={gi} className="glass-panel space-y-2 rounded-2xl p-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <ToneBadge tone={g.confidence === "high" ? "red" : "yellow"}>{t(`confidence.${g.confidence}`)}</ToneBadge>
                {g.reasons.map((r) => (
                  <ToneBadge key={r} tone="gray">
                    {t(`reason.${r}`)}
                  </ToneBadge>
                ))}
              </div>
              <div className="flex flex-wrap gap-2 overflow-x-auto">
                {g.records.map((r, i) => (
                  <DupCard key={r.kind === "lead" ? `l-${r.lead.id}-${i}` : `i-${r.institution.id}`} record={r} group={g} onEdit={onEdit} />
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate text-right">{value || "-"}</span>
    </div>
  );
}

function DupCard({ record, group, onEdit }: { record: DupRecord; group: DupGroup; onEdit: (lead: CrmLead) => void }) {
  const t = useTranslations("crm.duplicates");
  const errorMessage = useApiErrorMessage();
  const link = useLinkLead();
  const { isAdmin } = usePermissions();
  const [mergeOpen, setMergeOpen] = useState(false);

  if (record.kind === "institution") {
    const inst = record.institution;
    const unlinked = group.records.filter((r): r is Extract<DupRecord, { kind: "lead" }> => r.kind === "lead" && !r.lead.institutionId);
    const target = unlinked.length === 1 ? unlinked[0].lead : null;
    return (
      <div className="min-w-[220px] flex-1 space-y-1 rounded-xl border border-dashed border-border bg-background/60 p-3">
        <div className="flex items-center justify-between gap-2">
          <Link href={`/institutions/${inst.id}`} className="truncate text-sm font-medium hover:underline">
            {inst.name}
          </Link>
          <ToneBadge tone="yellow">{t("institutionOnly")}</ToneBadge>
        </div>
        <Field label={t("f.contact")} value={inst.contactName} />
        <Field label={t("f.email")} value={inst.email} />
        <Field label={t("f.phone")} value={inst.phone ? formatPhone(inst.phone) : null} />
        <Field label={t("f.created")} value={formatCrmDate(typeof inst.createdAt === "string" ? Date.parse(inst.createdAt) : inst.createdAt)} />
        {target && (
          <div className="pt-1">
            <Button
              size="sm"
              variant="outline"
              disabled={link.isPending}
              onClick={() =>
                link.mutate(
                  { id: target.id, institutionId: inst.id },
                  {
                    onSuccess: () => toast.success(t("linked")),
                    onError: (err) => toast.error(errorMessage(err, t("linkError"))),
                  }
                )
              }
            >
              <Link2 />
              {t("linkHere")}
            </Button>
          </div>
        )}
      </div>
    );
  }

  const l = record.lead;
  const otherLeads = group.records.filter((r): r is Extract<DupRecord, { kind: "lead" }> => r.kind === "lead" && r.lead.id !== l.id).map((r) => r.lead);
  return (
    <div className="min-w-[220px] flex-1 space-y-1 rounded-xl border border-border bg-background/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium">{l.organizationName || getLeadDisplayName(l)}</span>
        <StatusBadge status={l.status} />
      </div>
      <Field label={t("f.contact")} value={getLeadDisplayName(l)} />
      <Field label={t("f.email")} value={l.contactEmail} />
      <Field label={t("f.phone")} value={l.contactPhone ? formatPhone(l.contactPhone) : null} />
      <Field label={t("f.city")} value={l.city} />
      <Field label={t("f.created")} value={formatCrmDate(l.createdAt)} />
      <Field
        label={t("f.institution")}
        value={
          l.institutionId ? (
            <Link href={`/institutions/${l.institutionId}`} className="hover:underline">
              {l.institution?.name ?? "✓"}
            </Link>
          ) : null
        }
      />
      <div className="pt-1">
        <Button size="sm" variant="outline" onClick={() => onEdit(l)}>
          <Pencil />
          {t("edit")}
        </Button>
        {isAdmin && otherLeads.length > 0 && (
          <Button size="sm" variant="outline" className="ml-1.5" onClick={() => setMergeOpen(true)}>
            <GitMerge />
            {t("mergeHere")}
          </Button>
        )}
      </div>
      {mergeOpen && <CrmMergeDialog keep={l} others={otherLeads} onClose={() => setMergeOpen(false)} />}
    </div>
  );
}
