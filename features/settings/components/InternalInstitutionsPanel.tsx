"use client";

import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Building2 } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryErrorState } from "@/components/query-error-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InstitutionStatusBadge, useInstitutions } from "@/features/institutions";
import { usePermissions } from "@/features/auth";
import { useSetInternal } from "../internal/hooks";

/**
 * Ayarlar → Veri kalitesi: iç / sunum kurumları (DeepSportAdmin'deki "dahili ve test hesapları"
 * karşılığı). İşaretlenen kurum ana sayfa sayılarından ve analizlerden çıkar; listede "İç" etiketiyle
 * kalır. Liste veritabanında, ekipçe paylaşılır.
 */
export function InternalInstitutionsPanel() {
  const t = useTranslations("shell.settings.internal");
  const { isAdmin } = usePermissions();
  const query = useInstitutions();
  const setInternal = useSetInternal();
  const rows = (query.data ?? []).filter((i) => !i.missingInEdoras).sort((a, b) => a.name.localeCompare(b.name, "tr"));

  const toggle = (id: string, name: string, internal: boolean) =>
    setInternal.mutate(
      { institutionId: id, internal },
      {
        onSuccess: () => toast.success(t(internal ? "marked" : "unmarked", { name })),
        onError: () => toast.error(t("error")),
      }
    );

  return (
    <Card className="glass-panel rounded-2xl overflow-hidden">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-xl bg-primary/10 border border-primary/20">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          <h2 className="text-lg font-bold">{t("title")}</h2>
        </div>
        <p className="pt-2 text-sm text-muted-foreground">{t("description")}</p>
        {!isAdmin ? <p className="text-xs text-muted-foreground">{t("adminOnly")}</p> : null}
      </CardHeader>
      <CardContent className="pt-0">
        {query.isLoading ? (
          <Skeleton className="h-40 w-full rounded-xl" />
        ) : query.isError ? (
          <QueryErrorState onRetry={() => query.refetch()} />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">{t("internal")}</TableHead>
                <TableHead>Kurum</TableHead>
                <TableHead>Durum</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((i) => (
                <TableRow key={i.id}>
                  <TableCell>
                    <Checkbox
                      checked={i.isInternal}
                      disabled={!isAdmin || setInternal.isPending}
                      onCheckedChange={(v) => toggle(i.id, i.name, v === true)}
                      aria-label={`${t("internal")}: ${i.name}`}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{i.name}</TableCell>
                  <TableCell>
                    <InstitutionStatusBadge item={i} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
