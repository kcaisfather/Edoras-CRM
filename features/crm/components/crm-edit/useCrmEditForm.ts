"use client";

/**
 * Aday panelinin (CrmLeadSheet) düzenleme formu: şema, varsayılanlar, kayıtla eşitleme ve kaydetme. Davranış eski
 * düzenleme penceresiyle (CrmEditModal) aynı: leadFormSchema, formToPatch (kısmi PATCH; tutarlar yalnız finans
 * yetkisiyle), sunucu alan hataları forma işlenir, Satış oldu'ya geçişte devir notu açılır. Fark: kayıttan sonra panel
 * kapanmaz; form kaydedilen değerlerle "temiz" olur.
 */
import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { usePermissions } from "@/features/auth";
import { useApiErrorMessage } from "@/lib/hooks/use-api-error-message";
import { formToPatch, leadFormRuleErrors, leadFormSchema, leadToForm, type LeadFormValues } from "@/lib/domain/crm/form";
import type { CrmLead } from "@/lib/domain/crm/types";
import { useUpdateCrmLead } from "../../mutations";
import { applyLeadFieldErrors } from "./field-errors";

export function useCrmEditForm({ lead, onSold }: { lead: CrmLead; onSold?: (lead: CrmLead) => void }) {
  const t = useTranslations("crm.edit");
  const errorMessage = useApiErrorMessage();
  const { canSeeFinancials } = usePermissions();
  const update = useUpdateCrmLead();

  const form = useForm<LeadFormValues>({ resolver: zodResolver(leadFormSchema), defaultValues: leadToForm(lead) });
  const { reset, formState } = form;
  const isDirty = formState.isDirty;

  // Kayıt tazelenince (statü seçici, kaydetme, arka plan yenilemesi) form kayıttaki değerlere eşitlenir; kullanıcının
  // dokunduğu alanlar korunur (keepDirtyValues) — yarım düzenleme ezilmez. Başka kayda geçişte sıfırlanır.
  const loadedId = useRef(lead.id);
  useEffect(() => {
    if (loadedId.current !== lead.id) {
      loadedId.current = lead.id;
      reset(leadToForm(lead));
    } else {
      reset(leadToForm(lead), { keepDirtyValues: true });
    }
  }, [lead, reset]);

  const submit = form.handleSubmit((values) => {
    if (update.isPending) return;
    // Teklif / satış tutarı zorunlu (lib/domain/crm/form.ts → leadFormRuleErrors; sunucu ve veritabanı da zorlar).
    // Statü bu formdan değişmez (aday panelinde statü seçicisi ayrı), bu yüzden yalnız tutar hataları olur.
    const { status: _status, ...ruleErrors } = leadFormRuleErrors(values, { financial: canSeeFinancials, previousStatus: lead.status ?? null });
    for (const [field, message] of Object.entries(ruleErrors)) form.setError(field as keyof LeadFormValues, { type: "rule", message });
    if (Object.keys(ruleErrors).length) return;
    update.mutate(
      { id: lead.id, data: formToPatch(values, lead, canSeeFinancials) },
      {
        onSuccess: () => {
          toast.success(t("success"));
          // Kaydedilen değerler yeni başlangıç: form temiz olur (sunucu yanıtı gelince kayıtla yeniden eşitlenir).
          reset(values);
          if (values.status === "SATIS_OLDU" && lead.status !== "SATIS_OLDU") onSold?.(lead);
        },
        onError: (err) => {
          if (!applyLeadFieldErrors(form, err)) toast.error(errorMessage(err, t("error")));
        },
      }
    );
  });

  return {
    form,
    submit,
    isSaving: update.isPending,
    isDirty,
    /** Değişiklikleri at: formu kayıttaki değerlere döndürür. */
    discard: () => reset(leadToForm(lead)),
  };
}
