"use client";

import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Building2, ExternalLink, FlaskConical, Link2, Loader2, Unlink } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/lib/navigation";
import { InstitutionStatusBadge, programLabel, useInstitution } from "@/features/institutions";
import { useApiErrorMessage } from "@/lib/hooks/use-api-error-message";
import type { CrmLead } from "@/lib/domain/crm/types";
import { useUnlinkLead } from "../mutations";

/**
 * Adayın Edoras kurumu: bağlıysa kurum adı, durumu (Demo / Ücretli / Demo bitti…), kuruma git ve bağlantıyı
 * kaldır; değilse "Demo aç" ve "Kuruma bağla". `showUsage`: öğrenci / öğretmen / sınıf sayıları (Edoras'tan
 * canlı okunur — yalnız detay penceresinde).
 */
export function CrmLeadInstitution({
  lead,
  onOpenDemo,
  onLink,
  showUsage,
}: {
  lead: CrmLead;
  onOpenDemo?: (lead: CrmLead) => void;
  onLink?: (lead: CrmLead) => void;
  showUsage?: boolean;
}) {
  const t = useTranslations("crm.institution");
  const tList = useTranslations("crm.list");
  const errorMessage = useApiErrorMessage();
  const unlink = useUnlinkLead();

  if (!lead.institutionId) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">{t("notLinked")}</p>
        {(onOpenDemo || onLink) && (
          <div className="flex flex-wrap gap-2">
            {onOpenDemo && (
              <Button type="button" size="sm" variant="outline" onClick={() => onOpenDemo(lead)}>
                <FlaskConical />
                {tList("openDemo")}
              </Button>
            )}
            {onLink && (
              <Button type="button" size="sm" variant="outline" onClick={() => onLink(lead)}>
                <Link2 />
                {tList("linkInstitution")}
              </Button>
            )}
          </div>
        )}
      </div>
    );
  }

  const inst = lead.institution;
  const name = inst?.name ?? (inst === null ? t("missing") : t("unknown"));
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Building2 className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <span className="font-medium">{name}</span>
        {inst ? <InstitutionStatusBadge item={inst} /> : null}
        {inst?.program ? (
          <span className="rounded border border-border px-1.5 text-[10px] font-semibold text-muted-foreground">{programLabel(inst.program)}</span>
        ) : null}
      </div>
      {showUsage && inst && !inst.missingInEdoras ? <InstitutionUsage institutionId={lead.institutionId} /> : null}
      <div className="flex flex-wrap gap-2">
        <Link href={`/institutions/${lead.institutionId}`} className={buttonVariants({ size: "sm", variant: "outline" })}>
          <ExternalLink />
          {t("open")}
        </Link>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={unlink.isPending}
          onClick={() =>
            unlink.mutate(lead.id, {
              onSuccess: () => toast.success(t("unlinked")),
              onError: (err) => toast.error(errorMessage(err, t("unlinkError"))),
            })
          }
        >
          {unlink.isPending ? <Loader2 className="animate-spin" /> : <Unlink />}
          {t("unlink")}
        </Button>
      </div>
    </div>
  );
}

function InstitutionUsage({ institutionId }: { institutionId: string }) {
  const t = useTranslations("crm.institution");
  const { data } = useInstitution(institutionId);
  if (!data) return null;
  const { students, teachers, classes } = data.usage;
  return <p className="text-xs text-muted-foreground">{t("usage", { students, teachers, classes })}</p>;
}
