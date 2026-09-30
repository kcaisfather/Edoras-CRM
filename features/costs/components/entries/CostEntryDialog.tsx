"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertCircle, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { monthOfDay, monthsEndingAt } from "@/lib/domain/costs/months";
import { costEntryInputSchema, parseDecimal, type CostEntryInput } from "@/lib/domain/costs/schemas";
import { COST_SERVICES, type CostCurrency, type CostEntry, type CostService } from "@/lib/domain/costs/types";
import { todayIso } from "@/lib/domain/institutions/rules";
import { useApiErrorMessage } from "@/lib/hooks/use-api-error-message";
import { useCreateCostEntry, useUpdateCostEntry } from "../../mutations";
import { formatLiraExact, formatMonth } from "../shared/format";

interface FormState {
  service: CostService;
  month: string;
  amount: string;
  currency: CostCurrency;
  fxRate: string;
  note: string;
}

const blank = (): FormState => ({ service: "SUPABASE", month: monthOfDay(todayIso()), amount: "", currency: "TRY", fxRate: "", note: "" });

const fromEntry = (e: CostEntry): FormState => ({
  service: e.service,
  month: e.month,
  amount: String(e.amount).replace(".", ","),
  currency: e.currency,
  fxRate: e.fxRate === null ? "" : String(e.fxRate).replace(".", ","),
  note: e.note ?? "",
});

type FieldErrors = Partial<Record<"amount" | "fxRate" | "note", string>>;

/** Formu doğrular; hatalıysa alan mesaj anahtarları, değilse girdi. Sunucu aynı şemayı yeniden uygular. */
function validate(form: FormState): { input: CostEntryInput } | { errors: FieldErrors } {
  const errors: FieldErrors = {};
  const amount = parseDecimal(form.amount, 2);
  if (amount === null || amount <= 0) errors.amount = "amountInvalid";
  let fxRate: number | null = null;
  if (form.currency === "USD") {
    fxRate = parseDecimal(form.fxRate, 4);
    if (fxRate === null || fxRate <= 0) errors.fxRate = "fxInvalid";
  }
  if (form.note.trim().length > 500) errors.note = "noteTooLong";
  if (Object.keys(errors).length > 0) return { errors };
  const parsed = costEntryInputSchema.safeParse({ service: form.service, month: form.month, amount, currency: form.currency, fxRate, note: form.note });
  return parsed.success ? { input: parsed.data } : { errors: { amount: "amountInvalid" } };
}

/** Elle maliyet satırı ekle / düzenle (her açılışta yeni `key` ile bağlanır: form durumu açılışta sıfırlanır). USD ise kur (TL / USD) zorunlu; TL karşılığı ekranda önizlenir, kaydı veritabanı hesaplar. */
export function CostEntryDialog({ open, onOpenChange, entry }: { open: boolean; onOpenChange: (open: boolean) => void; entry: CostEntry | null }) {
  const t = useTranslations("costs.entries.form");
  const tSvc = useTranslations("costs.services.names");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("costs.errors");
  const errorText = useApiErrorMessage();
  const create = useCreateCostEntry();
  const update = useUpdateCostEntry();
  const [form, setForm] = useState<FormState>(() => (entry ? fromEntry(entry) : blank()));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<unknown>(null);
  const pending = create.isPending || update.isPending;

  const months = useMemo(() => {
    const list = monthsEndingAt(monthOfDay(todayIso()), 36).reverse();
    return list.includes(form.month) ? list : [form.month, ...list];
  }, [form.month]);

  const preview = useMemo(() => {
    const amount = parseDecimal(form.amount, 2);
    const fx = form.currency === "USD" ? parseDecimal(form.fxRate, 4) : 1;
    return amount !== null && fx !== null && amount > 0 && fx > 0 ? Math.round(amount * fx * 100) / 100 : null;
  }, [form.amount, form.fxRate, form.currency]);

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
      toast.success(t(entry ? "updated" : "created"));
      onOpenChange(false);
    };
    if (entry) update.mutate({ id: entry.id, input: result.input }, { onSuccess: done, onError: setServerError });
    else create.mutate(result.input, { onSuccess: done, onError: setServerError });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (pending ? undefined : onOpenChange(next))}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t(entry ? "editTitle" : "createTitle")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <form id="cost-entry-form" className="space-y-4" noValidate onSubmit={submit}>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="ce-service">{t("service")}</Label>
              <Select value={form.service} onValueChange={(v) => set("service", v as CostService)}>
                <SelectTrigger id="ce-service">
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
            <div className="space-y-1.5">
              <Label htmlFor="ce-month">{t("month")}</Label>
              <Select value={form.month} onValueChange={(v) => set("month", v)}>
                <SelectTrigger id="ce-month">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {months.map((m) => (
                    <SelectItem key={m} value={m}>
                      {formatMonth(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label id="ce-currency-label">{t("currency")}</Label>
            <SegmentedControl<CostCurrency>
              aria-label={t("currency")}
              value={form.currency}
              onValueChange={(v) => set("currency", v)}
              options={[
                { value: "TRY", label: t("currencyTRY") },
                { value: "USD", label: t("currencyUSD") },
              ]}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="ce-amount">{t("amount")}</Label>
              <Input id="ce-amount" inputMode="decimal" value={form.amount} onChange={(e) => set("amount", e.target.value)} aria-invalid={!!errors.amount} placeholder={form.currency === "USD" ? "25,00" : "1.250,50"} />
              {errors.amount ? <p className="text-xs text-destructive">{t(errors.amount)}</p> : null}
            </div>
            {form.currency === "USD" ? (
              <div className="space-y-1.5">
                <Label htmlFor="ce-fx">{t("fxRate")}</Label>
                <Input id="ce-fx" inputMode="decimal" value={form.fxRate} onChange={(e) => set("fxRate", e.target.value)} aria-invalid={!!errors.fxRate} placeholder="41,5000" />
                {errors.fxRate ? <p className="text-xs text-destructive">{t(errors.fxRate)}</p> : <p className="text-xs text-muted-foreground">{t("fxHelp")}</p>}
              </div>
            ) : null}
          </div>

          <p className="text-sm text-muted-foreground">
            {t("preview")}: <span className="font-mono font-medium text-foreground">{preview === null ? "—" : formatLiraExact(preview)}</span>
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="ce-note">{t("note")}</Label>
            <Input id="ce-note" value={form.note} maxLength={500} onChange={(e) => set("note", e.target.value)} placeholder={t("notePlaceholder")} aria-invalid={!!errors.note} />
            {errors.note ? <p className="text-xs text-destructive">{t(errors.note)}</p> : null}
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
          <Button type="submit" form="cost-entry-form" disabled={pending} aria-busy={pending}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            {t(entry ? "save" : "add")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
