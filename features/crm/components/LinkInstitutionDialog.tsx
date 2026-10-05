"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Link2, Loader2, Search } from "lucide-react";
import { SidePanel, SidePanelContent, SidePanelDescription, SidePanelHeader, SidePanelTitle } from "@/components/ui/side-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryErrorState } from "@/components/query-error-state";
import { InstitutionStatusBadge, formatPhone, programLabel, searchInstitutions, useInstitutions } from "@/features/institutions";
import { useApiErrorMessage } from "@/lib/hooks/use-api-error-message";
import { buildLeadIndex } from "@/lib/domain/crm/signals";
import type { CrmLead } from "@/lib/domain/crm/types";
import { getLeadDisplayName } from "@/lib/domain/crm/utils";
import { useLinkLead } from "../mutations";

const RESULT_LIMIT = 50;

/**
 * "Kuruma bağla": adayı Edoras'taki mevcut bir kurumla eşleştirir (kurum listesi önbellekte; arama istemcide).
 * Başka adaya bağlı kurum seçilemez (veritabanında da kurum başına tek aday), Edoras'ta olmayan kurum listelenmez.
 */
export function LinkInstitutionDialog({
  lead,
  leads,
  open,
  onOpenChange,
}: {
  lead: CrmLead | null;
  /** Tüm adaylar — hangi kurumun başka adaya bağlı olduğunu göstermek için. */
  leads: CrmLead[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("crm.link");
  if (!lead) return null;
  return (
    <SidePanel open={open} onOpenChange={onOpenChange}>
      <SidePanelContent size="lg">
        <SidePanelHeader>
          <SidePanelTitle>{t("title")}</SidePanelTitle>
          <SidePanelDescription>{t("description", { name: getLeadDisplayName(lead) })}</SidePanelDescription>
        </SidePanelHeader>
        {open && <Picker key={lead.id} lead={lead} leads={leads} onDone={() => onOpenChange(false)} />}
      </SidePanelContent>
    </SidePanel>
  );
}

function Picker({ lead, leads, onDone }: { lead: CrmLead; leads: CrmLead[]; onDone: () => void }) {
  const t = useTranslations("crm.link");
  const errorMessage = useApiErrorMessage();
  const institutions = useInstitutions();
  const link = useLinkLead();
  const [q, setQ] = useState(lead.organizationName ?? "");
  const [pendingId, setPendingId] = useState<string | null>(null);

  const taken = useMemo(() => buildLeadIndex(leads), [leads]);
  const results = useMemo(() => {
    const candidates = (institutions.data ?? []).filter((i) => !i.missingInEdoras);
    return searchInstitutions(candidates, q).slice(0, RESULT_LIMIT);
  }, [institutions.data, q]);

  const choose = (institutionId: string, name: string) => {
    setPendingId(institutionId);
    link.mutate(
      { id: lead.id, institutionId },
      {
        onSuccess: () => {
          toast.success(t("linked", { name }));
          onDone();
        },
        onError: (err) => toast.error(errorMessage(err, t("error"))),
        onSettled: () => setPendingId(null),
      }
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} aria-label={t("search")} className="h-9 pl-10" autoFocus />
      </div>
      {institutions.isLoading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : institutions.isError ? (
        <QueryErrorState onRetry={() => void institutions.refetch()} />
      ) : results.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="min-h-0 flex-1 divide-y divide-border/60 overflow-y-auto rounded-xl border border-border/60">
          {results.map((inst) => {
            const owner = taken.get(inst.id);
            const busy = pendingId === inst.id;
            return (
              <li key={inst.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0 space-y-0.5">
                  <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                    <span className="truncate">{inst.name}</span>
                    {inst.program ? (
                      <span className="rounded border border-border px-1.5 text-[10px] font-semibold text-muted-foreground">{programLabel(inst.program)}</span>
                    ) : null}
                    {inst.isInternal ? <span className="text-[10px] font-semibold text-category-1">{t("internal")}</span> : null}
                  </p>
                  <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <InstitutionStatusBadge item={inst} className="px-1.5 py-0 text-[10px]" />
                    {inst.crm ? `${inst.crm.contactName} · ${formatPhone(inst.crm.contactPhone)}` : null}
                  </p>
                </div>
                {owner && owner.id !== lead.id ? (
                  <span className="shrink-0 text-xs text-muted-foreground">{t("taken")}</span>
                ) : (
                  <Button size="sm" variant="outline" disabled={link.isPending} onClick={() => choose(inst.id, inst.name)}>
                    {busy ? <Loader2 className="animate-spin" /> : <Link2 />}
                    {t("submit")}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
