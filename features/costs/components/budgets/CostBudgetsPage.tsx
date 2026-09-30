"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApiErrorMessage } from "@/lib/hooks/use-api-error-message";
import type { BudgetStatus, CostBudget } from "@/lib/domain/costs/types";
import { cn } from "@/lib/utils";
import { useCostBudgets } from "../../queries";
import { useDeleteBudget } from "../../mutations";
import { BUDGET_STATE_STYLE, BudgetStateBadge, ServiceLabel } from "../shared/Badges";
import { CostEmptyState, CostErrorState, CostPanel, CostRowsSkeleton } from "../shared/CostStates";
import { CLICKABLE_ROW_CLASS, clickableRowProps } from "../shared/clickableRow";
import { formatLira, formatMonth, formatPct } from "../shared/format";
import { BudgetFormDialog } from "./BudgetFormDialog";

type Item = { budget: CostBudget; status: BudgetStatus };

/**
 * Maliyetler → Bütçeler (DeepSport CostBudgetsPage): bütçe listesi (ekle / düzenle / sil) ve içinde bulunulan aydaki durumu. Durum
 * okuma anında hesaplanır; DeepSport'taki "Şimdi değerlendir" düğmesi yok — saklanan uyarı da yok (Uyarılar sekmesi hesaplar).
 */
export function CostBudgetsPage() {
  const t = useTranslations("costs.budgets");
  const tScope = useTranslations("costs.budgets.scope");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("costs.errors");
  const errorText = useApiErrorMessage();
  const budgetsQ = useCostBudgets();
  const deleteMut = useDeleteBudget();
  const [formOpen, setFormOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const openForm = (budget: CostBudget | null) => {
    setEditing(budget);
    setFormKey((k) => k + 1);
    setFormOpen(true);
  };
  const [editing, setEditing] = useState<CostBudget | null>(null);
  const [detail, setDetail] = useState<Item | null>(null);
  const [deleteOf, setDeleteOf] = useState<CostBudget | null>(null);

  const items = budgetsQ.data?.items ?? [];

  const confirmDelete = () => {
    if (!deleteOf) return;
    deleteMut.mutate(deleteOf.id, {
      onSuccess: () => {
        toast.success(t("deleteSuccess"));
        setDeleteOf(null);
      },
      onError: (e) => toast.error(errorText(e, tErrors("mutationFailed"))),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{budgetsQ.data ? t("monthNote", { month: formatMonth(budgetsQ.data.month) }) : ""}</p>
        <Button size="sm" onClick={() => openForm(null)}>
          <Plus />
          {t("createNew")}
        </Button>
      </div>

      <CostPanel orb="vision-card-orb-emerald">
        {budgetsQ.isLoading ? (
          <CostRowsSkeleton rows={4} />
        ) : budgetsQ.isError ? (
          <CostErrorState onRetry={() => void budgetsQ.refetch()} />
        ) : items.length === 0 ? (
          <CostEmptyState message={t("empty")} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("tableScope")}</TableHead>
                <TableHead className="text-right">{t("tableLimit")}</TableHead>
                <TableHead className="min-w-40">{t("tableUsage")}</TableHead>
                <TableHead>{t("tableState")}</TableHead>
                <TableHead className="text-right">{t("tableActions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.budget.id} {...clickableRowProps(() => setDetail(item))} className={cn(CLICKABLE_ROW_CLASS, !item.budget.active && "opacity-60")}>
                  <TableCell className="text-sm font-medium text-foreground">
                    {item.budget.service ? <ServiceLabel service={item.budget.service} /> : tScope("GLOBAL")}
                    {!item.budget.active ? <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">{t("inactive")}</span> : null}
                  </TableCell>
                  <TableCell className="text-right font-mono">{formatLira(item.budget.monthlyLimitTry)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className={cn("h-full", BUDGET_STATE_STYLE[item.status.state].bar)} style={{ width: `${Math.min(100, item.status.usagePct)}%` }} />
                      </div>
                      <span className="w-12 text-right font-mono text-xs tabular-nums text-muted-foreground">{formatPct(item.status.usagePct, 0)}</span>
                    </div>
                  </TableCell>
                  <TableCell>{item.budget.active ? <BudgetStateBadge state={item.status.state} /> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-1">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={tCommon("edit")}
                        title={tCommon("edit")}
                        onClick={(e) => {
                          e.stopPropagation();
                          openForm(item.budget);
                        }}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={t("deleteAction")}
                        title={t("deleteAction")}
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteOf(item.budget);
                        }}
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CostPanel>

      <BudgetFormDialog key={formKey} open={formOpen} onOpenChange={setFormOpen} budget={editing} />
      <BudgetStatusSheet item={detail} onClose={() => setDetail(null)} />

      <Dialog open={!!deleteOf} onOpenChange={(o) => !o && setDeleteOf(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("deleteConfirmTitle")}</DialogTitle>
            <DialogDescription>{t("deleteConfirm")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOf(null)} disabled={deleteMut.isPending}>
              {tCommon("cancel")}
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleteMut.isPending} aria-busy={deleteMut.isPending}>
              {deleteMut.isPending ? <Loader2 className="animate-spin" /> : <Trash2 />}
              {t("deleteAction")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BudgetStatusSheet({ item, onClose }: { item: Item | null; onClose: () => void }) {
  const t = useTranslations("costs.budgets");
  const tScope = useTranslations("costs.budgets.scope");
  const tSvc = useTranslations("costs.services.names");
  const s = item?.status;
  return (
    <Sheet open={!!item} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto border-l sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t("statusTitle")}</SheetTitle>
          <SheetDescription>{item ? (item.budget.service ? tSvc(item.budget.service) : tScope("GLOBAL")) : ""}</SheetDescription>
        </SheetHeader>
        {s ? (
          <div className="mt-6 space-y-4 px-4 pb-6">
            <div className="glass-panel space-y-4 rounded-2xl p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{t("tableState")}</span>
                <BudgetStateBadge state={s.state} />
              </div>
              <div>
                <div className="mb-2 flex justify-between text-xs">
                  <span className="text-muted-foreground">{t("statusCurrentSpend")}</span>
                  <span className="font-mono text-foreground">
                    {formatLira(s.spentTry)} / {formatLira(s.monthlyLimitTry)}
                  </span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-muted">
                  <div className={cn("h-full transition-all", BUDGET_STATE_STYLE[s.state].bar)} style={{ width: `${Math.min(100, s.usagePct)}%` }} />
                </div>
                <p className="mt-1 text-right font-mono text-[10px] text-muted-foreground">{formatPct(s.usagePct, 1)}</p>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-2 text-xs">
                <span className="text-muted-foreground">{t("statusProjectedSpend")}</span>
                <span className="font-mono text-foreground">{formatLira(s.forecastTry)}</span>
              </div>
              {s.projectedOverrunTry > 0 ? (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{t("statusProjectedOverrun")}</span>
                  <span className="font-mono text-destructive">{formatLira(s.projectedOverrunTry)}</span>
                </div>
              ) : null}
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{t("statusSoftThreshold")}</span>
                <span className="font-mono text-foreground">{formatPct(s.softPct, 0)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{t("statusHardThreshold")}</span>
                <span className="font-mono text-foreground">{formatPct(s.hardPct, 0)}</span>
              </div>
            </div>
            {item?.budget.note ? <p className="text-xs text-muted-foreground">{item.budget.note}</p> : null}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
