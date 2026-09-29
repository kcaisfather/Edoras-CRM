"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowLeft, ListChecks, Loader2, RotateCcw, Save } from "lucide-react";
import { Link } from "@/lib/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CoverageNote } from "@/components/ui/coverage-note";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/features/auth";
import { useCrmRules } from "@/features/crm";
import { useApiErrorMessage } from "@/lib/hooks/use-api-error-message";
import {
  DEFAULT_RULES,
  RULES_NEEDING_MODULE,
  RULES_WITHOUT_DAYS,
  isDefaultRules,
  normalizeRules,
  ruleParamRange,
  type RuleConfig,
} from "@/lib/domain/tasks/rules";

/** Kural parametresi izin verilen aralıkta mı (HTML min/max yalnız ipucu; elle yazılan değer denetlenir). */
function paramInRange(rule: RuleConfig): boolean {
  if (RULES_WITHOUT_DAYS.includes(rule.id)) return true;
  const { min, max } = ruleParamRange(rule.id);
  return Number.isInteger(rule.days) && rule.days >= min && rule.days <= max;
}

const sameRules = (a: RuleConfig[], b: RuleConfig[]) => JSON.stringify(normalizeRules(a)) === JSON.stringify(normalizeRules(b));

/**
 * Madde 12 — takip kuralları (DeepSport RulesEditor): gün sayısı ve aktiflik. Kurallar ekip geneli (crm_rules);
 * yalnız yönetici değiştirir, kaydetmeden önce onay istenir. `embedded`: Ayarlar → Kurallar sekmesinde başlık ve
 * bağlantılar çizilmez.
 */
export function RulesEditor({ embedded = false }: { embedded?: boolean }) {
  const t = useTranslations("crm.rules");
  const tCommon = useTranslations("common");
  const tNav = useTranslations("crm.nav");
  const { rules, isLoading, isError, isSaving, save } = useCrmRules();
  const { isAdmin } = usePermissions();
  const errorMessage = useApiErrorMessage();
  const canEdit = isAdmin;

  const [draft, setDraft] = useState<RuleConfig[] | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const current = draft ?? rules;
  const dirty = draft != null && !sameRules(draft, rules);
  const hasInvalid = current.some((r) => !paramInRange(r));

  const update = (id: RuleConfig["id"], patch: Partial<RuleConfig>) => setDraft(current.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const persist = async () => {
    try {
      await save(current);
      setDraft(null);
      setConfirmOpen(false);
      toast.success(t("saved"));
    } catch (err) {
      toast.error(errorMessage(err, t("error")));
    }
  };

  const onSave = () => {
    if (!dirty || hasInvalid) return;
    setConfirmOpen(true);
  };

  return (
    <div className="space-y-4">
      {!embedded && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
            <p className="text-sm text-muted-foreground">{t("description")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/crm" className={buttonVariants({ size: "sm", variant: "ghost" })}>
              <ArrowLeft />
              {tNav("leads")}
            </Link>
            <Link href="/crm/tasks" className={buttonVariants({ size: "sm", variant: "outline" })}>
              <ListChecks />
              {tNav("tasks")}
            </Link>
          </div>
        </div>
      )}
      {embedded && <p className="text-sm text-muted-foreground">{t("description")}</p>}
      {!canEdit && <CoverageNote>{t("adminOnly")}</CoverageNote>}

      {isLoading ? (
        <Skeleton className="h-72 w-full rounded-2xl" />
      ) : (
        <>
          {isError && <CoverageNote>{t("loadError")}</CoverageNote>}
          <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/60">
            <div className="w-full overflow-x-auto">
              <Table className="[&_thead_tr]:bg-muted/40">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("table.rule")}</TableHead>
                    <TableHead>{t("table.when")}</TableHead>
                    <TableHead className="w-32">{t("table.days")}</TableHead>
                    <TableHead className="w-20 text-center">{t("table.active")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {current.map((rule) => (
                    <RuleRow key={rule.id} rule={rule} disabled={!canEdit || isSaving} onChange={(patch) => update(rule.id, patch)} />
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {canEdit && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {dirty && <span className="mr-auto text-xs text-muted-foreground">{t("unsaved")}</span>}
              {!dirty && isDefaultRules(current) && <span className="mr-auto text-xs text-muted-foreground">{t("defaults")}</span>}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDraft(DEFAULT_RULES.map((r) => ({ ...r })))}
                disabled={isSaving || isDefaultRules(current)}
              >
                <RotateCcw />
                {t("reset")}
              </Button>
              {dirty && (
                <Button variant="outline" size="sm" onClick={() => setDraft(null)} disabled={isSaving}>
                  {tCommon("cancel")}
                </Button>
              )}
              <Button size="sm" onClick={onSave} disabled={!dirty || hasInvalid || isSaving} aria-busy={isSaving}>
                {isSaving ? <Loader2 className="animate-spin" /> : <Save />}
                {t("save")}
              </Button>
            </div>
          )}
        </>
      )}

      <Dialog open={confirmOpen} onOpenChange={(o) => !isSaving && setConfirmOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("confirmTitle")}</DialogTitle>
            <DialogDescription>{t("confirmBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={isSaving}>
              {tCommon("cancel")}
            </Button>
            <Button onClick={() => void persist()} disabled={isSaving} aria-busy={isSaving}>
              {isSaving && <Loader2 className="animate-spin" />}
              {t("confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RuleRow({ rule, disabled, onChange }: { rule: RuleConfig; disabled: boolean; onChange: (patch: Partial<RuleConfig>) => void }) {
  const t = useTranslations("crm.rules");
  const noDays = RULES_WITHOUT_DAYS.includes(rule.id);
  const range = ruleParamRange(rule.id);
  const needs = RULES_NEEDING_MODULE[rule.id];
  const name = t(`name.${rule.id}`);
  const invalid = !paramInRange(rule);
  return (
    <TableRow className={cn(!rule.enabled && "opacity-60")}>
      <TableCell className="font-medium">{name}</TableCell>
      <TableCell>
        <div className="flex flex-col">
          <span className="text-sm">{t(`when.${rule.id}`, { days: rule.days })}</span>
          {needs && <span className="text-xs text-muted-foreground">{t(`needsModule.${needs}`)}</span>}
        </div>
      </TableCell>
      <TableCell>
        {noDays ? (
          <span className="text-muted-foreground">{t("noDays")}</span>
        ) : (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                min={range.min}
                max={range.max}
                step={1}
                value={rule.days}
                disabled={disabled}
                aria-label={t("daysLabel", { rule: name })}
                onChange={(e) => onChange({ days: Number(e.target.value) })}
                className="h-8 w-20"
                aria-invalid={invalid || undefined}
                aria-describedby={invalid ? `rule-${rule.id}-error` : undefined}
              />
              <span className="text-xs text-muted-foreground">{t("unit.days")}</span>
            </div>
            {invalid && (
              <p id={`rule-${rule.id}-error`} className="text-xs text-destructive">
                {t("outOfRange", { min: range.min, max: range.max })}
              </p>
            )}
          </div>
        )}
      </TableCell>
      <TableCell className="text-center">
        <Checkbox
          checked={rule.enabled}
          disabled={disabled}
          aria-label={t("activeLabel", { rule: name })}
          onCheckedChange={(v) => onChange({ enabled: v === true })}
        />
      </TableCell>
    </TableRow>
  );
}
