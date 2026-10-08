"use client";

import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Blocks, Info } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryErrorState } from "@/components/query-error-state";
import { usePermissions } from "@/features/auth";
import { useApiErrorMessage } from "@/lib/hooks/use-api-error-message";
import type { InstitutionDetail } from "@/lib/domain/institutions/types";
import { useSetPanelModule } from "../mutations";
import { useInstitutionPanelModules } from "../queries";
import { formatDateTime } from "../format";
import { SectionCard } from "./detail-cards";

/**
 * Edoras panel modülleri (ör. Muhasebe) — kurum bazında aç / kapa. Edoras'ın migration 300 sözleşmesi: satır yoksa
 * katalog varsayılanı. Kapatmak Edoras'ta veri silmez; menü, sayfalar, veri uçları ve mobil ekran kapanır.
 * Yalnız ADMIN değiştirir; diğer personel durumu görür.
 */
export function PanelModulesCard({ institution }: { institution: InstitutionDetail }) {
  const t = useTranslations("institutions.detail.modules");
  const { isAdmin } = usePermissions();
  const errorText = useApiErrorMessage();
  const query = useInstitutionPanelModules(institution.id, !institution.missingInEdoras);
  const mutation = useSetPanelModule(institution.id);

  if (institution.missingInEdoras) return null;

  return (
    <SectionCard icon={Blocks} title={t("title")}>
      {query.isLoading ? (
        <Skeleton className="h-14 w-full rounded-xl" />
      ) : query.isError ? (
        <QueryErrorState onRetry={() => query.refetch()} />
      ) : !query.data?.length ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="space-y-3">
          {query.data.map((module) => {
            const pending = mutation.isPending && mutation.variables?.key === module.key;
            const inputId = `panel-module-${module.key}`;
            return (
              <li key={module.key} className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-3">
                <Checkbox
                  id={inputId}
                  className="mt-0.5"
                  checked={module.enabled}
                  disabled={!isAdmin || mutation.isPending}
                  onCheckedChange={(checked) =>
                    mutation.mutate(
                      { key: module.key, enabled: checked === true },
                      {
                        onSuccess: () =>
                          toast.success(checked === true ? t("enabledToast", { name: module.label }) : t("disabledToast", { name: module.label })),
                        onError: (e) => toast.error(errorText(e)),
                      }
                    )
                  }
                />
                <label htmlFor={inputId} className="min-w-0 flex-1 cursor-pointer space-y-0.5">
                  <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    {module.label}
                    <span
                      className={
                        module.enabled
                          ? "rounded bg-primary/10 px-1.5 text-[11px] font-semibold text-primary"
                          : "rounded border border-border px-1.5 text-[11px] font-semibold text-muted-foreground"
                      }
                    >
                      {pending ? t("saving") : module.enabled ? t("on") : t("off")}
                    </span>
                  </span>
                  {module.description ? <span className="block text-xs text-muted-foreground">{module.description}</span> : null}
                  <span className="block text-[11px] text-muted-foreground">
                    {module.isDefault
                      ? t(module.defaultEnabled ? "defaultOn" : "defaultOff")
                      : module.updatedAt
                        ? t("updatedAt", { date: formatDateTime(module.updatedAt) })
                        : null}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {isAdmin ? t("note") : t("adminOnly")}
      </p>
    </SectionCard>
  );
}
