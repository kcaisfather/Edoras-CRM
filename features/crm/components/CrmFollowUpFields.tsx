"use client";

import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import type { UseFormReturn } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { LeadFormValues } from "@/lib/domain/crm/form";
import { COMPETITOR_NAME_MAX, LOST_NOTE_MAX } from "@/lib/domain/crm/loss-detail";
import { LOST_REASONS, type CrmStatus } from "@/lib/domain/crm/types";
import { formatCrmDate } from "@/lib/domain/crm/utils";

const TEXTAREA_CLASS =
  "flex min-h-[64px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm resize-y";

/**
 * Madde 4 — sonraki arama tarihi ve (Satış olmadı için) kayıp nedeni. Aranacak / Ulaşılamadı / Teklif verildi / Takipte /
 * Satış olmadı statülerinde ekleme ve düzenleme formlarında gösterilir. Değerler crm_leads kolonlarına
 * yazılır (DeepSport'taki not yedeği yok).
 */
export function CrmFollowUpFields({
  idPrefix,
  status,
  nextCall,
  onNextCall,
  lostReason,
  onLostReason,
  offerDate,
  disabled,
  form,
}: {
  idPrefix: string;
  status: CrmStatus;
  nextCall: string;
  onNextCall: (v: string) => void;
  lostReason: string;
  onLostReason: (v: string) => void;
  /** Açık teklifin tarihi (YYYY-MM-DD). */
  offerDate?: string | null;
  disabled?: boolean;
  /** Verilirse "Satış olmadı"da kayıp ayrıntısı alanları (kayıp notu, rakip, yeniden temas) da gösterilir. */
  form?: UseFormReturn<LeadFormValues>;
}) {
  const t = useTranslations("crm.offer");
  const tLoss = useTranslations("crm.lossDetail");
  return (
    <div className="mt-3 space-y-2 rounded-lg border border-border bg-muted/30 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("sectionTitle")}</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-nextCall`}>{t("nextCall")}</Label>
          <div className="flex gap-1">
            <Input
              id={`${idPrefix}-nextCall`}
              type="date"
              value={nextCall}
              onChange={(e) => onNextCall(e.target.value)}
              disabled={disabled}
            />
            {nextCall && (
              <Button variant="ghost" size="icon" onClick={() => onNextCall("")} aria-label={t("clear")} title={t("clear")} disabled={disabled}>
                <X />
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{t("nextCallHint")}</p>
        </div>
        {status === "OLUMSUZ" && (
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-lostReason`}>{t("lostReason")}</Label>
            <Select value={lostReason || "__none__"} onValueChange={(v) => onLostReason(v === "__none__" ? "" : v)} disabled={disabled}>
              <SelectTrigger id={`${idPrefix}-lostReason`}>
                <SelectValue placeholder={t("lostReasonPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t("noReason")}</SelectItem>
                {LOST_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {t(`reasons.${r}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {status === "OLUMSUZ" && form && (
          <>
            {lostReason === "COMPETITOR" && (
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor={`${idPrefix}-competitor`}>{tLoss("competitor")}</Label>
                <Input
                  id={`${idPrefix}-competitor`}
                  maxLength={COMPETITOR_NAME_MAX}
                  placeholder={tLoss("competitorPlaceholder")}
                  disabled={disabled}
                  {...form.register("competitor")}
                />
              </div>
            )}
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor={`${idPrefix}-lostNote`}>{tLoss("note")}</Label>
              <textarea
                id={`${idPrefix}-lostNote`}
                rows={2}
                maxLength={LOST_NOTE_MAX}
                className={TEXTAREA_CLASS}
                placeholder={tLoss("notePlaceholder")}
                disabled={disabled}
                {...form.register("lostNote")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-recallAt`}>{tLoss("recallAt")}</Label>
              <Input id={`${idPrefix}-recallAt`} type="date" disabled={disabled} {...form.register("recallAt")} />
              <p className="text-xs text-muted-foreground">{tLoss("recallHint")}</p>
            </div>
          </>
        )}
        {status === "TEKLIF_VERILDI" && offerDate && (
          <p className="self-end text-xs text-muted-foreground">{t("offerDate", { date: formatCrmDate(offerDate) })}</p>
        )}
      </div>
    </div>
  );
}
