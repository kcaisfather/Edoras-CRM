"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, ExternalLink, Loader2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SidePanel, SidePanelContent, SidePanelDescription, SidePanelFooter, SidePanelHeader, SidePanelTitle } from "@/components/ui/side-panel";
import { Link } from "@/lib/navigation";
import { usePermissions } from "@/features/auth";
import { useApiErrorMessage } from "@/lib/hooks/use-api-error-message";
import { parseAmount } from "@/lib/utils/money";
import { cn } from "@/lib/utils";
import { isIsoDate, todayIso } from "@/lib/domain/institutions/rules";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/domain/institutions/types";
import { collectionBlock, defaultCollectionAmount, planCollection } from "@/lib/domain/crm/collections";
import { leadBalance } from "@/lib/domain/crm/signals";
import type { CrmLead } from "@/lib/domain/crm/types";
import { formatCurrency, getLeadDisplayName } from "@/lib/domain/crm/utils";
import { useAddCollection } from "../mutations";
import { TEXTAREA_CLASS } from "./CrmNoteList";

/**
 * "Tahsilat ekle" = adayın bağlı olduğu kuruma ödeme kaydı (crm_payments). Tutar (varsayılan kalan bakiye;
 * fazla ödemeye uyarıyla izin), tarih (bugün), yöntem, not ve açık onay. Ön koşul (kuruma bağlı, kurum CRM'e
 * kayıtlı, fatura bilgisi tam) sağlanmıyorsa form yerine nedeni ve kurum sayfasına bağlantı gösterilir;
 * veritabanı da aynı kuralı zorunlu kılar. Tutar yetkisi yoksa hiçbir şey çizmez.
 */
export function CrmCollectionDialog({
  lead,
  open,
  onOpenChange,
}: {
  lead: CrmLead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { canSeeFinancials } = usePermissions();
  if (!lead || !canSeeFinancials) return null;
  return (
    <SidePanel open={open} onOpenChange={onOpenChange}>
      <SidePanelContent size="md">
        {/* key: başka aday ya da yeniden açılış → form varsayılanlara döner */}
        {open && <CollectionForm key={lead.id} lead={lead} onClose={() => onOpenChange(false)} />}
      </SidePanelContent>
    </SidePanel>
  );
}

function CollectionForm({ lead, onClose }: { lead: CrmLead; onClose: () => void }) {
  const t = useTranslations("crm.collections");
  const tMethod = useTranslations("institutions.paymentMethod");
  const errorMessage = useApiErrorMessage();
  const add = useAddCollection();
  const [amountText, setAmountText] = useState(() => defaultCollectionAmount(lead));
  const [date, setDate] = useState(() => todayIso());
  const [method, setMethod] = useState<PaymentMethod | "">("");
  const [note, setNote] = useState("");

  const block = collectionBlock(lead);
  const amount = parseAmount(amountText) ?? 0;
  const plan = planCollection(lead, amount);
  const balance = leadBalance(lead);
  const amountError = amountText.trim() !== "" && amount <= 0;
  const dateError = !isIsoDate(date);
  const canConfirm = !block && amount > 0 && !dateError && !!method && !add.isPending;
  const title = [getLeadDisplayName(lead), lead.organizationName].filter((v, i, a) => v && a.indexOf(v) === i).join(" · ");

  const confirm = () => {
    if (!canConfirm || !lead.institutionId || !method) return;
    add.mutate(
      {
        leadId: lead.id,
        institutionId: lead.institutionId,
        input: { payAmount: String(amount), payMethod: method, paidOn: date, licenseId: "", note },
      },
      {
        onSuccess: () => {
          toast.success(t("saved", { amount: formatCurrency(amount) }));
          onClose();
        },
        onError: (err) => toast.error(errorMessage(err, t("failed"))),
      }
    );
  };

  return (
    <>
      <SidePanelHeader>
        <SidePanelTitle>{t("title")}</SidePanelTitle>
        <SidePanelDescription>{title}</SidePanelDescription>
      </SidePanelHeader>

      <dl className="grid grid-cols-3 gap-2 rounded-xl border border-border/60 bg-muted/30 p-3 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">{t("sale")}</dt>
          <dd className="font-medium tabular-nums">{formatCurrency(lead.saleAmount ?? 0)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("collected")}</dt>
          <dd className="font-medium tabular-nums">{formatCurrency(lead.collectedAmount ?? 0)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("remaining")}</dt>
          <dd className={cn("font-medium tabular-nums", balance > 0 && "text-destructive")}>{formatCurrency(balance)}</dd>
        </div>
      </dl>

      {block ? (
        <div role="alert" className="space-y-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
          <p className="flex gap-2">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>{t(`blocked.${block}`)}</span>
          </p>
          {block !== "notLinked" && lead.institutionId && (
            <Link href={`/institutions/${lead.institutionId}`} className={buttonVariants({ size: "sm", variant: "outline" })}>
              <ExternalLink />
              {t("openInstitution")}
            </Link>
          )}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="collection-amount">{t("amount")}</Label>
              <Input
                id="collection-amount"
                inputMode="decimal"
                placeholder="0"
                value={amountText}
                onChange={(e) => setAmountText(e.target.value)}
                aria-invalid={amountError || undefined}
                disabled={add.isPending}
              />
              {amountError && <p className="text-xs text-destructive">{t("amountInvalid")}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="collection-date">{t("date")}</Label>
              <Input
                id="collection-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-invalid={dateError || undefined}
                disabled={add.isPending}
              />
              {dateError && <p className="text-xs text-destructive">{t("dateInvalid")}</p>}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="collection-method">{t("method")}</Label>
            <Select value={method || undefined} onValueChange={(v) => setMethod(v as PaymentMethod)} disabled={add.isPending}>
              <SelectTrigger id="collection-method">
                <SelectValue placeholder={t("method")} />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {tMethod(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="collection-note">{t("note")}</Label>
            <textarea
              id="collection-note"
              rows={2}
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("notePlaceholder")}
              disabled={add.isPending}
              className={cn(TEXTAREA_CLASS, "min-h-[64px]")}
            />
          </div>

          {plan.overpay > 0 && amount > 0 && (
            <div role="alert" className="flex gap-2 rounded-lg border border-warning/30 bg-warning/10 p-2.5 text-xs text-warning">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>{t("overpay", { amount: formatCurrency(plan.overpay) })}</span>
            </div>
          )}
          {amount > 0 && (
            <p className="text-xs text-muted-foreground">
              {t("preview", {
                from: formatCurrency(lead.collectedAmount ?? 0),
                to: formatCurrency(plan.nextCollected),
                remaining: formatCurrency(plan.balanceAfter),
              })}
            </p>
          )}
          {lead.institution?.name && <p className="text-xs text-muted-foreground">{t("institution", { name: lead.institution.name })}</p>}
        </>
      )}

      <SidePanelFooter>
        <Button variant="outline" onClick={onClose} disabled={add.isPending}>
          {t("cancel")}
        </Button>
        {!block && (
          <Button onClick={confirm} disabled={!canConfirm} aria-busy={add.isPending}>
            {add.isPending && <Loader2 className="animate-spin" />}
            {t("confirm", { amount: formatCurrency(amount) })}
          </Button>
        )}
      </SidePanelFooter>
    </>
  );
}
