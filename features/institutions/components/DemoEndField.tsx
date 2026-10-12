"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useFormContext, useWatch } from "react-hook-form";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { SEGMENT_ACTIVE, SEGMENT_GROUP, SEGMENT_INACTIVE, SEGMENT_ITEM } from "@/components/ui/segmented-control";
import { cn } from "@/lib/utils";
import { addDays, isIsoDate } from "@/lib/domain/institutions/rules";
import {
  DEMO_DURATION_CHOICES,
  demoEndFor,
  demoLengthDays,
  isValidDemoEnd,
  matchDemoChoice,
  type DemoDurationChoice,
} from "@/lib/domain/institutions/demo-duration";
import { formatDate } from "../format";

type Mode = DemoDurationChoice | "custom";
const MODES: readonly Mode[] = [...DEMO_DURATION_CHOICES, "custom"];

/**
 * Demo süresi (kurum bazlı; kurucu kararı 2026-10-12): hızlı seçim (14 gün / 1 ay / 3 ay / 1 yıl) ya da "Özel tarih".
 * Hiçbiri önceden seçili değildir — hazır süre yok; alan boşken form gönderilmez (şema: demoEndsOn zorunlu). Değer
 * form alanına bitiş tarihi (YYYY-MM-DD) olarak yazılır; seçili düğme değerden türetilir (form sıfırlanınca boşalır).
 *
 * - `startsOn`: demonun başlangıcı — özel tarihin alt sınırı (bitiş > başlangıç) ve özetteki toplam gün.
 * - `choicesFrom`: hızlı seçimlerin sayıldığı gün (varsayılan `startsOn`; bitişi değiştirirken bugün → "bugünden 1 ay").
 *   Bu gün değişirse (CRM'e kaydet → demo başlangıcı) hızlı seçimle gelen bitiş yeni güne göre kayar; özel tarih kalır.
 * - `summary`: geçerli bitişin altında görünen özet (varsayılan "Bitiş: … · N günlük demo").
 */
export function DemoEndField({
  name = "demoEndsOn",
  label,
  startsOn,
  choicesFrom = startsOn,
  hint,
  summary,
}: {
  name?: string;
  label?: string;
  startsOn: string;
  choicesFrom?: string;
  hint?: string;
  summary?: (endsOn: string) => React.ReactNode;
}) {
  const t = useTranslations("institutions.demoDuration");
  const { control, getValues, setValue } = useFormContext();
  const value = (useWatch({ control, name }) as string | undefined) ?? "";
  // Yalnız "Özel tarih"e basıldığını tutar (tarih henüz boşken ya da bir hızlı seçime denk gelirken de açık kalsın).
  const [customPicked, setCustomPicked] = useState(false);
  const matched = matchDemoChoice(choicesFrom, value);
  const mode: Mode | null = customPicked ? "custom" : (matched ?? (value ? "custom" : null));

  // Sayım günü değişince: önceki güne göre hızlı seçime denk gelen bitiş yeni güne taşınır.
  const prevFrom = useRef(choicesFrom);
  useEffect(() => {
    const prev = prevFrom.current;
    prevFrom.current = choicesFrom;
    if (prev === choicesFrom || customPicked || !isIsoDate(prev) || !isIsoDate(choicesFrom)) return;
    const choice = matchDemoChoice(prev, getValues(name) as string | undefined);
    if (choice) setValue(name, demoEndFor(choicesFrom, choice), { shouldDirty: true, shouldValidate: true });
  }, [choicesFrom, customPicked, name, getValues, setValue]);

  const choose = (next: Mode) => {
    setCustomPicked(next === "custom");
    if (next !== "custom" && isIsoDate(choicesFrom)) {
      setValue(name, demoEndFor(choicesFrom, next), { shouldDirty: true, shouldValidate: true });
    }
  };

  const fieldLabel = label ?? t("label");
  const description = isValidDemoEnd(startsOn, value)
    ? (summary?.(value) ?? t("summary", { date: formatDate(value), days: demoLengthDays(startsOn, value) }))
    : (hint ?? t("hint"));

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{fieldLabel}</FormLabel>
          <div role="group" aria-label={fieldLabel} className={cn(SEGMENT_GROUP, "flex flex-wrap")}>
            {MODES.map((m, i) => (
              <button
                key={m}
                // Seçim yokken hata odağı ilk düğmeye gelir; özel tarihte tarih kutusuna.
                ref={i === 0 && mode !== "custom" ? field.ref : undefined}
                type="button"
                aria-pressed={mode === m}
                onClick={() => choose(m)}
                className={cn(SEGMENT_ITEM, mode === m ? SEGMENT_ACTIVE : SEGMENT_INACTIVE)}
              >
                {t(`choices.${m}`)}
              </button>
            ))}
          </div>
          {mode === "custom" ? (
            <FormControl>
              <Input
                {...field}
                value={value}
                type="date"
                min={isIsoDate(startsOn) ? addDays(startsOn, 1) : undefined}
                aria-label={t("customDate")}
                className="sm:max-w-56"
              />
            </FormControl>
          ) : null}
          <FormDescription>{description}</FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
