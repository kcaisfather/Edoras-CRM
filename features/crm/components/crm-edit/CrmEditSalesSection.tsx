"use client";

import { useTranslations } from "next-intl";
import { useWatch, type UseFormReturn } from "react-hook-form";
import { HandCoins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { usePermissions } from "@/features/auth";
import { parseAmount } from "@/lib/utils/money";
import { cn } from "@/lib/utils";
import type { LeadFormValues } from "@/lib/domain/crm/form";
import type { CrmLead } from "@/lib/domain/crm/types";
import { formatCurrency, getRemainingAmount } from "@/lib/domain/crm/utils";
import { AmountField } from "../CrmLeadFields";

/**
 * Satış bölümü (yalnız finans yetkisiyle — EK-3: tutar alanları CRM_AGENT'a gösterilmez, sunucu da boş gönderir):
 * teklif ve satış tutarı (form), tahsil edilen (bağlı kurumun ödemeleri; "Tahsilat ekle" ile girilir) ve kalan.
 */
export function CrmEditSalesSection({
  form,
  lead,
  onAddCollection,
}: {
  form: UseFormReturn<LeadFormValues>;
  lead: CrmLead;
  onAddCollection?: () => void;
}) {
  const t = useTranslations("crm.edit");
  const tForm = useTranslations("crm.form");
  const tX = useTranslations("crm");
  const { canSeeFinancials } = usePermissions();
  const saleValue = useWatch({ control: form.control, name: "saleAmount" });
  if (!canSeeFinancials) return null;
  const remaining = getRemainingAmount(parseAmount(saleValue) ?? 0, lead.collectedAmount);

  return (
    <section className="space-y-3">
      <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{tForm("salesSection")}</p>
      <div className="grid grid-cols-2 gap-3">
        <AmountField form={form} name="offerAmount" label={tForm("offerAmount")} idPrefix="crm-sheet" />
        <AmountField form={form} name="saleAmount" label={tForm("saleAmount")} idPrefix="crm-sheet" />
        <div className="space-y-1.5">
          <Label>{tForm("collectedAmount")}</Label>
          <div className="flex h-9 items-center justify-between gap-2 rounded-md border border-border bg-muted/50 pl-3 pr-1 text-sm">
            <span className="tabular-nums">{formatCurrency(lead.collectedAmount ?? 0)}</span>
            {onAddCollection && (
              <Button type="button" size="sm" variant="outline" className="h-7" onClick={onAddCollection}>
                <HandCoins />
                {tX("list.addCollection")}
              </Button>
            )}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>{tForm("remainingAmount")}</Label>
          <div
            className={cn(
              "flex h-9 items-center rounded-md border border-border bg-muted/50 px-3 text-sm font-semibold tabular-nums",
              remaining > 0 ? "text-destructive" : "text-success"
            )}
          >
            {formatCurrency(remaining)}
          </div>
        </div>
        <p className="col-span-2 -mt-1 text-xs text-muted-foreground">
          {tX("offer.amountHint")} {t("collectionHint")}
        </p>
      </div>
    </section>
  );
}
