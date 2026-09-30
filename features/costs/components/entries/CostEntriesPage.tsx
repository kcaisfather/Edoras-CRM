"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { VisionListPagination } from "@/components/ui/vision-list-pagination";
import { isMonthKey } from "@/lib/domain/costs/months";
import { COST_SERVICES, type CostEntry, type CostService } from "@/lib/domain/costs/types";
import { useApiErrorMessage } from "@/lib/hooks/use-api-error-message";
import { useRouter } from "@/lib/navigation";
import { useCostEntries } from "../../queries";
import { useDeleteCostEntry } from "../../mutations";
import { CostEmptyState, CostErrorState, CostPanel, CostRowsSkeleton } from "../shared/CostStates";
import { ServiceLabel } from "../shared/Badges";
import { MONTH_CHOICES } from "../shared/MonthPicker";
import { formatLiraExact, formatMonth } from "../shared/format";
import { CostEntryDialog } from "./CostEntryDialog";
import { CostImportDialog } from "./CostImportDialog";
import { addMonthsKey, monthOfDay } from "@/lib/domain/costs/months";
import { todayIso } from "@/lib/domain/institutions/rules";

const ALL = "__all__";
const SIZE = 20;

/**
 * Maliyetler → Kayıtlar (yeni; DeepSport'ta yoktu çünkü veri AWS'den geliyordu): maliyet defteri. Satırlar elle eklenir / düzenlenir /
 * silinir ya da CSV / Excel ile içe aktarılır. Süzgeçler URL'de (?service=, ?from=, ?to= (YYYY-MM), ?page=).
 */
export function CostEntriesPage() {
  const t = useTranslations("costs.entries");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("costs.errors");
  const tSvc = useTranslations("costs.services.names");
  const errorText = useApiErrorMessage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const serviceParam = searchParams.get("service") ?? "";
  const service = (COST_SERVICES as readonly string[]).includes(serviceParam) ? (serviceParam as CostService) : "";
  const from = isMonthKey(searchParams.get("from")) ? (searchParams.get("from") as string) : "";
  const to = isMonthKey(searchParams.get("to")) ? (searchParams.get("to") as string) : "";
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10) || 0);

  const entriesQ = useCostEntries({ service, from, to, page, size: SIZE });
  const deleteMut = useDeleteCostEntry();
  const [editing, setEditing] = useState<CostEntry | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const openForm = (entry: CostEntry | null) => {
    setEditing(entry);
    setFormKey((k) => k + 1);
    setFormOpen(true);
  };
  const [importOpen, setImportOpen] = useState(false);
  const [deleteOf, setDeleteOf] = useState<CostEntry | null>(null);

  const patch = (changes: Record<string, string>, resetPage = true) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    if (resetPage) params.delete("page");
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  };

  const current = monthOfDay(todayIso());
  const monthOptions = Array.from({ length: MONTH_CHOICES }, (_, i) => addMonthsKey(current, -i));
  const data = entriesQ.data;
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / SIZE));

  const confirmDelete = () => {
    if (!deleteOf) return;
    deleteMut.mutate(deleteOf.id, {
      onSuccess: () => {
        toast.success(t("deleted"));
        setDeleteOf(null);
      },
      onError: (e) => toast.error(errorText(e, tErrors("mutationFailed"))),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label htmlFor="ent-service" className="text-xs text-muted-foreground">
              {t("filters.service")}:
            </label>
            <Select value={service || ALL} onValueChange={(v) => patch({ service: v === ALL ? "" : v })}>
              <SelectTrigger id="ent-service" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("filters.allServices")}</SelectItem>
                {COST_SERVICES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {tSvc(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {(["from", "to"] as const).map((key) => (
            <div key={key} className="flex items-center gap-2">
              <label htmlFor={`ent-${key}`} className="text-xs text-muted-foreground">
                {t(`filters.${key}`)}:
              </label>
              <Select value={(key === "from" ? from : to) || ALL} onValueChange={(v) => patch({ [key]: v === ALL ? "" : v })}>
                <SelectTrigger id={`ent-${key}`} className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{t("filters.anyMonth")}</SelectItem>
                  {monthOptions.map((m) => (
                    <SelectItem key={m} value={m}>
                      {formatMonth(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
          {service || from || to ? (
            <Button variant="ghost" size="sm" onClick={() => patch({ service: "", from: "", to: "" })}>
              <X />
              {t("filters.clear")}
            </Button>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
            <Upload />
            {t("import.open")}
          </Button>
          <Button size="sm" onClick={() => openForm(null)}>
            <Plus />
            {t("add")}
          </Button>
        </div>
      </div>

      <CostPanel orb="vision-card-orb-emerald" description={total > 0 ? t("summary", { count: total, total: formatLiraExact(data?.totalTry ?? 0) }) : undefined}>
        {entriesQ.isLoading && !data ? (
          <CostRowsSkeleton rows={5} />
        ) : entriesQ.isError && !data ? (
          <CostErrorState onRetry={() => void entriesQ.refetch()} />
        ) : !data || data.items.length === 0 ? (
          <CostEmptyState message={t("empty")} />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("table.month")}</TableHead>
                  <TableHead>{t("table.service")}</TableHead>
                  <TableHead className="text-right">{t("table.amount")}</TableHead>
                  <TableHead className="text-right">{t("table.amountTry")}</TableHead>
                  <TableHead>{t("table.note")}</TableHead>
                  <TableHead>{t("table.source")}</TableHead>
                  <TableHead className="text-right">{t("table.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap">{formatMonth(e.month)}</TableCell>
                    <TableCell>
                      <ServiceLabel service={e.service} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right font-mono text-xs">
                      {e.currency === "USD" ? (
                        <>
                          ${e.amount.toLocaleString("tr-TR")} <span className="text-muted-foreground">× {e.fxRate}</span>
                        </>
                      ) : (
                        formatLiraExact(e.amount)
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono">{formatLiraExact(e.amountTry)}</TableCell>
                    <TableCell className="max-w-56 truncate text-xs text-muted-foreground" title={e.note ?? undefined}>
                      {e.note ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {t(`source.${e.source}`)}
                      {e.createdByName ? ` · ${e.createdByName}` : ""}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-1">
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={tCommon("edit")}
                          title={tCommon("edit")}
                          onClick={() => openForm(e)}
                        >
                          <Pencil />
                        </Button>
                        <Button size="icon-sm" variant="ghost" aria-label={t("delete")} title={t("delete")} onClick={() => setDeleteOf(e)} className="text-destructive hover:bg-destructive/10 hover:text-destructive">
                          <Trash2 />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {totalPages > 1 ? (
              <div className="mt-4">
                <VisionListPagination
                  currentPage={page}
                  totalPages={totalPages}
                  onPageChange={(p) => patch({ page: p ? String(p) : "" }, false)}
                  from={page * SIZE + 1}
                  to={Math.min((page + 1) * SIZE, total)}
                  total={total}
                  renderShowing={(a, b, c) => (
                    <>
                      {a} - {b} / {c}
                    </>
                  )}
                  previousLabel={t("previous")}
                  nextLabel={t("next")}
                />
              </div>
            ) : null}
          </>
        )}
      </CostPanel>

      <CostEntryDialog key={formKey} open={formOpen} onOpenChange={setFormOpen} entry={editing} />
      <CostImportDialog open={importOpen} onOpenChange={setImportOpen} />

      <Dialog open={!!deleteOf} onOpenChange={(o) => !o && setDeleteOf(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("deleteConfirmTitle")}</DialogTitle>
            <DialogDescription>{deleteOf ? t("deleteConfirm", { service: tSvc(deleteOf.service), month: formatMonth(deleteOf.month), amount: formatLiraExact(deleteOf.amountTry) }) : ""}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOf(null)} disabled={deleteMut.isPending}>
              {tCommon("cancel")}
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleteMut.isPending} aria-busy={deleteMut.isPending}>
              {deleteMut.isPending ? <Loader2 className="animate-spin" /> : <Trash2 />}
              {t("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
