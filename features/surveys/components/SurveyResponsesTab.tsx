"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Building2, ClipboardList } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { CoverageNote } from "@/components/ui/coverage-note";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryErrorState } from "@/components/query-error-state";
import { Link } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { csvDate, downloadCsv } from "@/lib/utils/csv";
import { formatCrmDate } from "@/lib/domain/crm/utils";
import { npsCategory, type NpsCategory } from "@/lib/domain/surveys/logic";
import { useSurveyResponses } from "../queries";
import { NPS_TONE } from "./parts";

type RespFilter = "all" | NpsCategory;
const FILTERS: RespFilter[] = ["all", "promoter", "passive", "detractor"];

/**
 * Yanıtlar: müşterinin kendi puanı ve yorumu (salt okunur). Eleştirmen yanıtında DeepSport'taki gibi ticket / otomatik
 * görev yok; şikâyet kaydı adayın notlarından elle açılır (SIKAYET).
 */
export function SurveyResponsesTab({ surveyId }: { surveyId: string }) {
  const t = useTranslations("surveys.responses");
  const tc = useTranslations("surveys.common");
  const query = useSurveyResponses(surveyId);
  const [filter, setFilter] = useState<RespFilter>("all");
  const iconLink = buttonVariants({ variant: "ghost", size: "icon-sm" });

  const rows = useMemo(
    () => (query.data?.items ?? []).filter((r) => filter === "all" || (r.nps != null && npsCategory(r.nps) === filter)),
    [query.data, filter]
  );

  if (query.isLoading) return <Skeleton className="h-64 w-full rounded-2xl" />;
  if (query.isError) return <QueryErrorState onRetry={() => void query.refetch()} />;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <SegmentedControl<RespFilter>
          value={filter}
          onValueChange={setFilter}
          aria-label={t("filterLabel")}
          options={FILTERS.map((v) => ({ value: v, label: t(`filters.${v}`) }))}
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            downloadCsv(
              "anket-yanitlari",
              [t("table.customer"), t("table.organization"), "NPS", "Memnuniyet", t("table.comment"), t("table.date")],
              rows.map((r) => [r.recipientName, r.organizationName, r.nps, r.csat, r.comment, csvDate(r.createdAt)])
            )
          }
        >
          {tc("csv")}
        </Button>
      </div>
      {query.data?.truncated && <CoverageNote>{tc("truncated", { loaded: query.data.items.length, total: query.data.total })}</CoverageNote>}

      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/60">
        <div className="w-full overflow-x-auto">
          <Table className="[&_thead_tr]:bg-muted/40">
            <TableHeader>
              <TableRow>
                <TableHead>{t("table.customer")}</TableHead>
                <TableHead className="text-right">NPS</TableHead>
                <TableHead className="text-right">CSAT</TableHead>
                <TableHead>{t("table.comment")}</TableHead>
                <TableHead>{t("table.date")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    {tc("empty")}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="font-medium">{r.organizationName || r.recipientName || "—"}</span>
                        {r.organizationName && r.recipientName && <span className="text-xs text-muted-foreground">{r.recipientName}</span>}
                      </div>
                    </TableCell>
                    <TableCell className={cn("text-right font-semibold tabular-nums", r.nps != null && NPS_TONE[npsCategory(r.nps)])}>{r.nps ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.csat != null ? `${r.csat}/5` : "—"}</TableCell>
                    <TableCell className="max-w-md">
                      <p className="line-clamp-3 text-sm text-muted-foreground" title={r.comment ?? undefined}>
                        {r.comment || "—"}
                      </p>
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">{formatCrmDate(r.createdAt)}</TableCell>
                    <TableCell>
                      {r.leadId ? (
                        <Link href={`/crm?lead=${r.leadId}`} className={iconLink} title={tc("openLead")} aria-label={tc("openLead")}>
                          <ClipboardList />
                        </Link>
                      ) : (
                        r.institutionId && (
                          <Link href={`/institutions/${r.institutionId}`} className={iconLink} title={tc("openInstitution")} aria-label={tc("openInstitution")}>
                            <Building2 />
                          </Link>
                        )
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
