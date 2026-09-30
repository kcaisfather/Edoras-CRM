"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertCircle, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { costBudgetInputSchema, parseDecimal, type CostBudgetInput } from "@/lib/domain/costs/schemas";
import { COST_SERVICES, type BudgetScope, type CostBudget, type CostService } from "@/lib/domain/costs/types";
import { useApiErrorMessage } from "@/lib/hooks/use-api-error-message";
import { useCreateBudget, useUpdateBudget } from "../../mutations";

interface FormState {
  scope: BudgetScope;
  service: CostService;
  limit: string;
  softPct: string;
  hardPct: string;
  active: boolean;
  note: string;
}

const blank = (): FormState => ({ scope: "GLOBAL", service: "SUPABASE", limit: "", softPct: "80", hardPct: "100", active: true, note: "" });

const fromBudget = (b: CostBudget): FormState => ({
  scope: b.scope,
  service: b.service ?? "SUPABASE",
  limit: String(b.monthlyLimitTry).replace(".", ","),
  softPct: String(b.softPct),
  hardPct: String(b.hardPct),
  active: b.active,
  note: b.note ?? "",
});

type Errors = Partial<Record<"limit" | "softPct" | "hardPct", string>>;

function validate(f: FormState): { input: CostBudgetInput } | { errors: Errors } {
  const errors: Errors = {};
  const limit = parseDecimal(f.limit, 2);
  if (limit === null || limit <= 0) errors.limit = "limitPositive";
  const soft = Number(f.softPct);
  const hard = Number(f.hardPct);
  if (!Number.isInteger(soft) || soft < 1 || soft > 100) errors.softPct = "softRange";
  if (!Number.isInteger(hard) || hard < 2 || hard > 200) errors.hardPct = "hardRange";
  else if (!errors.softPct && hard <= soft) errors.hardPct = "hardAboveSoft";
  if (Object.keys(errors).length > 0) return { errors };
  const parsed = costBudgetInputSchema.safeParse({
    scope: f.scope,
    service: f.scope === "SERVICE" ? f.service : null,
    monthlyLimitTry: limit,
    softPct: soft,
    hardPct: hard,
    active: f.active,
    note: f.note,
  });
  return parsed.success ? { input: parsed.data } : { errors: { limit: "limitPositive" } };
}

/** Bütçe ekle / düzenle (DeepSport BudgetFormDialog; her açılışta yeni `key` ile bağlanır: form durumu açılışta sıfırlanır): kapsam GLOBAL ya da tek hizmet; limit TL; yumuşak / sert eşik %. */
export function BudgetFormDialog({ open, onOpenChange, budget }: { open: boolean; onOpenChange: (open: boolean) => void; budget: CostBudget | null }) {
  const t = useTranslations("costs.budgets.form");
  const tSvc = useTranslations("costs.services.names");
  const tScope = useTranslations("costs.budgets.scope");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("costs.errors");
  const errorText = useApiErrorMessage();
  const create = useCreateBudget();
  const update = useUpdateBudget();
  const [form, setForm] = useState<FormState>(() => (budget ? fromBudget(budget) : blank()));
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState<unknown>(null);
  const pending = create.isPending || update.isPending;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = validate(form);
    if ("errors" in result) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setServerError(null);
    const done = () => {
      toast.success(t(budget ? "updated" : "created"));
      onOpenChange(false);
    };
    if (budget) update.mutate({ id: budget.id, input: result.input }, { onSuccess: done, onError: setServerError });
    else create.mutate(result.input, { onSuccess: done, onError: setServerError });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (pending ? undefined : onOpenChange(next))}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t(budget ? "editTitle" : "createTitle")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <form id="cost-budget-form" className="space-y-4" noValidate onSubmit={submit}>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="cb-scope">{t("scope")}</Label>
              <Select value={form.scope} onValueChange={(v) => set("scope", v as BudgetScope)}>
                <SelectTrigger id="cb-scope">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GLOBAL">{tScope("GLOBAL")}</SelectItem>
                  <SelectItem value="SERVICE">{tScope("SERVICE")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.scope === "SERVICE" ? (
              <div className="space-y-1.5">
                <Label htmlFor="cb-service">{t("service")}</Label>
                <Select value={form.service} onValueChange={(v) => set("service", v as CostService)}>
                  <SelectTrigger id="cb-service">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COST_SERVICES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {tSvc(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cb-limit">{t("limit")}</Label>
            <Input id="cb-limit" inputMode="decimal" value={form.limit} onChange={(e) => set("limit", e.target.value)} aria-invalid={!!errors.limit} placeholder="5.000" />
            {errors.limit ? <p className="text-xs text-destructive">{t(errors.limit)}</p> : null}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="cb-soft">{t("softPct")}</Label>
              <Input id="cb-soft" inputMode="numeric" value={form.softPct} onChange={(e) => set("softPct", e.target.value)} aria-invalid={!!errors.softPct} />
              {errors.softPct ? <p className="text-xs text-destructive">{t(errors.softPct)}</p> : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cb-hard">{t("hardPct")}</Label>
              <Input id="cb-hard" inputMode="numeric" value={form.hardPct} onChange={(e) => set("hardPct", e.target.value)} aria-invalid={!!errors.hardPct} />
              {errors.hardPct ? <p className="text-xs text-destructive">{t(errors.hardPct)}</p> : null}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t("thresholdHelp")}</p>

          <div className="space-y-1.5">
            <Label htmlFor="cb-note">{t("note")}</Label>
            <Input id="cb-note" value={form.note} maxLength={500} onChange={(e) => set("note", e.target.value)} />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox id="cb-active" checked={form.active} onCheckedChange={(v) => set("active", v === true)} />
            <Label htmlFor="cb-active" className="font-normal">
              {t("active")}
            </Label>
          </div>
        </form>
        {serverError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{errorText(serverError, tErrors("mutationFailed"))}</AlertDescription>
          </Alert>
        ) : null}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {tCommon("cancel")}
          </Button>
          <Button type="submit" form="cost-budget-form" disabled={pending} aria-busy={pending}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            {t(budget ? "save" : "add")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
