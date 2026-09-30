"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, FileText, Loader2, Mail, PenLine } from "lucide-react";
import { Link } from "@/lib/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryErrorState } from "@/components/query-error-state";
import { usePermissions } from "@/features/auth";
import { formatDate, useInstitution } from "@/features/institutions";
import { billingProfileCompleteness } from "@/lib/domain/institutions/billing-profile";
import { isIsoDate, todayIso } from "@/lib/domain/institutions/rules";
import type { InstitutionDetail } from "@/lib/domain/institutions/types";
import {
  DEFAULT_VAT_RATE,
  VAT_RATES,
  computeVat,
  hasActiveInvoice,
  invoiceIdempotencyKey,
  saleRefOf,
} from "@/lib/domain/invoices/logic";
import type { InvoiceMode } from "@/lib/domain/invoices/types";
import { useApiErrorMessage } from "@/lib/hooks/use-api-error-message";
import { formatTry, parseAmount } from "@/lib/utils/money";
import { useCreateInvoice } from "../mutations";
import { useInvoiceOptions, useInvoicesForSale } from "../queries";

/**
 * Faturalanacak satış: bir ödeme (tahsilat) ya da lisans. Kurum sayfasındaki ödeme satırından `paymentId`, CRM adayından
 * yalnız `institutionId` (satış pencerede seçilir) verilir.
 */
export interface InvoiceTarget {
  institutionId: string;
  paymentId?: string | null;
  licenseId?: string | null;
}

interface SaleOption {
  key: string;
  paymentId: string | null;
  licenseId: string | null;
  kind: "payment" | "license";
  label: string;
  amount: number;
  description: string;
}

/**
 * "Fatura kes" (DeepSport InvoiceDialog): E-posta ile talep (muhasebeciye) / Elle kayıt (başka yerde kesildi) / Platforma
 * aktar (Paraşüt; henüz bağlı değil). İki adımlı onay. Yalnız ADMIN (CRM_AGENT'a hiç çizilmez; uç da 403 döner).
 * Açılınca kurumun lisans, ödeme ve fatura bilgisini kendisi okur (useInstitution) — çağıran yalnız hedefi verir.
 */
export function InvoiceDialog({
  target,
  open,
  onOpenChange,
}: {
  target: InvoiceTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { canSeeFinancials } = usePermissions();
  if (!open || !target || !canSeeFinancials) return null;
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <InvoiceBody target={target} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function saleOptions(institution: InstitutionDetail, t: ReturnType<typeof useTranslations>, tMethod: ReturnType<typeof useTranslations>): SaleOption[] {
  const licenseById = new Map(institution.licenses.map((l) => [l.id, l]));
  const baseDescription = t("defaultDescription");
  const describe = (licenseId: string | null) => {
    const license = licenseId ? licenseById.get(licenseId) : null;
    return license ? `${baseDescription} (${formatDate(license.startsOn)} – ${formatDate(license.endsOn)})` : baseDescription;
  };
  const payments: SaleOption[] = (institution.payments ?? []).map((p) => ({
    key: saleRefOf({ kind: "payment", id: p.id }),
    paymentId: p.id,
    licenseId: p.licenseId,
    kind: "payment",
    label: t("salePayment", { date: formatDate(p.paidOn), method: tMethod(p.method), amount: formatTry(p.amount) }),
    amount: p.amount,
    description: describe(p.licenseId),
  }));
  const licenses: SaleOption[] = institution.licenses.map((l) => ({
    key: saleRefOf({ kind: "license", id: l.id }),
    paymentId: null,
    licenseId: l.id,
    kind: "license",
    label: t("saleLicense", { start: formatDate(l.startsOn), end: formatDate(l.endsOn), amount: l.price != null ? formatTry(l.price) : "—" }),
    amount: l.price ?? 0,
    description: describe(l.id),
  }));
  return [...payments, ...licenses];
}

function InvoiceBody({ target, onClose }: { target: InvoiceTarget; onClose: () => void }) {
  const t = useTranslations("sales.invoices.dialog");
  const tMethod = useTranslations("institutions.paymentMethod");
  const query = useInstitution(target.institutionId);
  const options = useInvoiceOptions();

  const institution = query.data;
  const sales = institution ? saleOptions(institution, t, tMethod) : [];
  const initialKey = target.paymentId
    ? saleRefOf({ kind: "payment", id: target.paymentId })
    : target.licenseId
      ? saleRefOf({ kind: "license", id: target.licenseId })
      : (sales[0]?.key ?? "");
  const [picked, setPicked] = useState<string | null>(null);
  const saleKey = picked ?? initialKey;
  const sale = sales.find((s) => s.key === saleKey) ?? sales[0] ?? null;

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("title")}</DialogTitle>
        <DialogDescription>{institution?.name ?? "…"}</DialogDescription>
      </DialogHeader>

      {query.isLoading || options.isLoading ? (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">{t("loading")}</p>
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      ) : query.isError || !institution || options.isError || !options.data ? (
        <QueryErrorState
          onRetry={() => {
            void query.refetch();
            void options.refetch();
          }}
        />
      ) : !sale ? (
        <p className="text-sm text-muted-foreground">{t("noSale")}</p>
      ) : (
        <>
          {sales.length > 1 ? (
            <div className="space-y-1.5">
              <Label htmlFor="inv-sale">{t("saleLabel")}</Label>
              <Select value={sale.key} onValueChange={setPicked}>
                <SelectTrigger id="inv-sale">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sales.map((s) => (
                    <SelectItem key={s.key} value={s.key}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{sale.label}</p>
          )}
          {/* key: satış değişince form (tutar, açıklama) sıfırlanır */}
          <InvoiceForm key={sale.key} institution={institution} sale={sale} options={options.data} onClose={onClose} />
        </>
      )}
    </>
  );
}

function InvoiceForm({
  institution,
  sale,
  options,
  onClose,
}: {
  institution: InstitutionDetail;
  sale: SaleOption;
  options: { providers: { code: string; configured: boolean }[]; emailAvailable: boolean };
  onClose: () => void;
}) {
  const t = useTranslations("sales.invoices.dialog");
  const tBilling = useTranslations("sales.billing");
  const tCommon = useTranslations("sales.common");
  const errorMessage = useApiErrorMessage();
  const providerReady = options.providers.some((p) => p.code === "PARASUT" && p.configured);
  const saleRef = saleRefOf(sale.paymentId ? { kind: "payment", id: sale.paymentId } : { kind: "license", id: sale.licenseId as string });

  const existing = useInvoicesForSale(saleRef);
  const [mode, setMode] = useState<InvoiceMode>(options.emailAvailable ? "EMAIL" : "MANUAL");
  const [amountText, setAmountText] = useState(() => (sale.amount > 0 ? String(sale.amount) : ""));
  const [vatRate, setVatRate] = useState<number>(DEFAULT_VAT_RATE);
  const [vatIncluded, setVatIncluded] = useState(true);
  const [description, setDescription] = useState(sale.description);
  const [issueDate, setIssueDate] = useState(() => todayIso());
  const [copyCustomer, setCopyCustomer] = useState(false);
  const [invoiceNo, setInvoiceNo] = useState("");
  const [note, setNote] = useState("");
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const [step, setStep] = useState<"form" | "confirm">("form");

  const amount = parseAmount(amountText) ?? 0;
  const vat = computeVat(amount, vatRate, vatIncluded);
  const billing = institution.billing;
  const completeness = billingProfileCompleteness(billing);
  const existingItems = existing.data?.items ?? [];
  const duplicate = hasActiveInvoice(existingItems);
  const customerEmail = billing?.email ?? null;

  const problems: string[] = [];
  if (!institution.crm?.billingComplete) problems.push(t("problems.billingBase"));
  if (amount <= 0) problems.push(t("problems.amount"));
  if (description.trim().length < 2) problems.push(t("problems.description"));
  if (!isIsoDate(issueDate)) problems.push(t("problems.date"));
  if (mode === "MANUAL" && !invoiceNo.trim()) problems.push(t("problems.invoiceNo"));
  if (mode === "EMAIL" && !options.emailAvailable) problems.push(t("problems.emailUnavailable"));
  if (mode === "PROVIDER" && !providerReady) problems.push(t("problems.providerUnavailable"));
  if (mode !== "MANUAL" && !completeness.complete) problems.push(t("problems.billing"));
  if (duplicate && !allowDuplicate) problems.push(t("problems.duplicate"));
  // Mevcut faturalar okunmadan mükerrer kontrolü yapılamaz → yüklenene kadar (ya da hata varken) kayıt kapalı.
  if (existing.isLoading) problems.push(t("problems.checkingExisting"));
  if (existing.isError) problems.push(t("problems.existingUnknown"));

  const create = useCreateInvoice();
  const submit = () => {
    const key = invoiceIdempotencyKey({ saleRef, mode, amount: vat.gross, issueDate, existingCount: existingItems.length });
    create.mutate(
      {
        key,
        input: {
          institutionId: institution.id,
          paymentId: sale.paymentId,
          licenseId: sale.licenseId,
          mode,
          provider: mode === "PROVIDER" ? "PARASUT" : undefined,
          amount,
          vatRate,
          vatIncluded,
          description: description.trim(),
          issueDate,
          copyCustomer: mode === "EMAIL" ? copyCustomer : undefined,
          invoiceNo: mode === "MANUAL" ? invoiceNo.trim() : undefined,
          note: note.trim() || undefined,
        },
      },
      {
        onSuccess: (inv) => {
          if (inv.status === "FAILED") toast.error(t("failedToast", { error: inv.error ?? "" }));
          else toast.success(mode === "EMAIL" ? t("sentToast") : t("savedToast"));
          onClose();
        },
        onError: (err) => toast.error(errorMessage(err, t("errorToast"))),
      }
    );
  };

  const modes: { value: InvoiceMode; label: string; icon: React.ReactNode; disabled?: boolean }[] = [
    { value: "EMAIL", label: t("modes.EMAIL"), icon: <Mail />, disabled: !options.emailAvailable },
    { value: "MANUAL", label: t("modes.MANUAL"), icon: <PenLine /> },
    { value: "PROVIDER", label: t("modes.PROVIDER"), icon: <FileText />, disabled: !providerReady },
  ];

  if (step === "confirm") {
    return (
      <ConfirmStep
        mode={mode}
        withCopy={copyCustomer && customerEmail != null}
        invoiceNo={invoiceNo.trim()}
        vat={vat}
        vatRate={vatRate}
        issueDate={issueDate}
        pending={create.isPending}
        onBack={() => setStep("form")}
        onConfirm={submit}
      />
    );
  }

  return (
    <>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <SegmentedControl<InvoiceMode> value={mode} onValueChange={setMode} aria-label={t("modeLabel")} options={modes} />
          <p className="text-xs text-muted-foreground">{t(`modeHints.${mode}`)}</p>
        </div>

        {!options.emailAvailable ? (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <span className="font-medium">{t("emailUnavailableTitle")}.</span> {t("emailUnavailableBody")}
            </AlertDescription>
          </Alert>
        ) : null}
        {!providerReady ? <p className="text-xs text-muted-foreground">{t("providerUnavailable")}</p> : null}

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
          <span className="text-sm">{t("billingProfile")}</span>
          {completeness.complete ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-success/25 bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
              {tBilling("complete")}
            </span>
          ) : (
            <span className="flex flex-wrap items-center gap-2">
              <span
                className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning"
                title={[...completeness.missing, ...completeness.invalid.filter((f) => !completeness.missing.includes(f))]
                  .map((f) => tBilling(`fields.${f}`))
                  .join(", ")}
              >
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                {tBilling("incomplete", { count: new Set([...completeness.missing, ...completeness.invalid]).size })}
              </span>
              <Link href={`/institutions/${institution.id}`} className="text-xs text-primary hover:underline" onClick={onClose}>
                {t("billingProfileLink")}
              </Link>
            </span>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="inv-amount">{t("amount")}</Label>
            <Input id="inv-amount" inputMode="decimal" placeholder="0" value={amountText} onChange={(e) => setAmountText(e.target.value)} />
            <p className="text-xs text-muted-foreground">{t(sale.kind === "payment" ? "amountHintPayment" : "amountHintLicense")}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-vat">{t("vatRate")}</Label>
            <Select value={String(vatRate)} onValueChange={(v) => setVatRate(Number(v))}>
              <SelectTrigger id="inv-vat">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VAT_RATES.map((r) => (
                  <SelectItem key={r} value={String(r)}>
                    %{r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox checked={vatIncluded} onCheckedChange={(v) => setVatIncluded(v === true)} />
              {t("vatIncluded")}
            </label>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="inv-desc">{t("description")}</Label>
            <Input id="inv-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-date">{t("issueDate")}</Label>
            <Input id="inv-date" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          </div>
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm tabular-nums">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("net")}</span>
              {formatTry(vat.net)}
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("vatLine", { rate: vatRate })}</span>
              {formatTry(vat.vat)}
            </div>
            <div className="flex justify-between font-semibold">
              <span>{t("gross")}</span>
              {formatTry(vat.gross)}
            </div>
          </div>
        </div>

        {mode === "MANUAL" ? (
          <div className="space-y-1.5">
            <Label htmlFor="inv-no">{t("invoiceNo")}</Label>
            <Input id="inv-no" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} placeholder={t("invoiceNoPlaceholder")} maxLength={64} />
          </div>
        ) : null}

        {mode === "EMAIL" ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{t("recipientsHint")}</p>
            {customerEmail ? (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={copyCustomer} onCheckedChange={(v) => setCopyCustomer(v === true)} />
                {t("copyCustomer", { email: customerEmail })}
              </label>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="inv-note">{t("note")}</Label>
              <textarea
                id="inv-note"
                rows={2}
                value={note}
                maxLength={500}
                onChange={(e) => setNote(e.target.value)}
                className="flex w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm"
              />
            </div>
          </div>
        ) : null}

        {duplicate ? (
          <div className="space-y-2 rounded-lg border border-warning/30 bg-warning/[0.06] px-3 py-2 text-sm">
            <p className="flex items-center gap-1.5 text-warning">
              <AlertTriangle className="h-4 w-4" />
              {t("duplicateWarning", { count: existingItems.length })}
            </p>
            <label className="flex items-center gap-2">
              <Checkbox checked={allowDuplicate} onCheckedChange={(v) => setAllowDuplicate(v === true)} />
              {t("allowDuplicate")}
            </label>
          </div>
        ) : null}

        {existing.isError ? <QueryErrorState onRetry={() => void existing.refetch()} /> : null}

        {problems.length > 0 ? (
          <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        ) : null}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          {tCommon("cancel")}
        </Button>
        <Button onClick={() => setStep("confirm")} disabled={problems.length > 0}>
          {t("next")}
        </Button>
      </DialogFooter>
    </>
  );
}

/** İkinci adım: özet + "Onayla" (üretim yazması: iki adımlı onay). */
function ConfirmStep({
  mode,
  withCopy,
  invoiceNo,
  vat,
  vatRate,
  issueDate,
  pending,
  onBack,
  onConfirm,
}: {
  mode: InvoiceMode;
  withCopy: boolean;
  invoiceNo: string;
  vat: { net: number; vat: number; gross: number };
  vatRate: number;
  issueDate: string;
  pending: boolean;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations("sales.invoices.dialog");
  const tCommon = useTranslations("sales.common");
  return (
    <>
      <div className="space-y-3 text-sm">
        <p>
          {mode === "EMAIL"
            ? t("confirmEmail", { copy: withCopy ? t("confirmCopy") : "" })
            : mode === "MANUAL"
              ? t("confirmManual", { no: invoiceNo })
              : t("confirmProvider", { provider: "Paraşüt" })}
        </p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border border-border bg-muted/40 px-3 py-2">
          <dt className="text-muted-foreground">{t("net")}</dt>
          <dd className="text-right tabular-nums">{formatTry(vat.net)}</dd>
          <dt className="text-muted-foreground">{t("vatLine", { rate: vatRate })}</dt>
          <dd className="text-right tabular-nums">{formatTry(vat.vat)}</dd>
          <dt className="font-medium">{t("gross")}</dt>
          <dd className="text-right font-semibold tabular-nums">{formatTry(vat.gross)}</dd>
          <dt className="text-muted-foreground">{t("issueDate")}</dt>
          <dd className="text-right">{formatDate(issueDate)}</dd>
        </dl>
        <p className="text-xs text-muted-foreground">{t("confirmNote")}</p>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onBack} disabled={pending}>
          {tCommon("back")}
        </Button>
        <Button onClick={onConfirm} disabled={pending} aria-busy={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          {mode === "EMAIL" ? t("confirmSend") : mode === "MANUAL" ? t("confirmSave") : t("confirmIssue")}
        </Button>
      </DialogFooter>
    </>
  );
}
