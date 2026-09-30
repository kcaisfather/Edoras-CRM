"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addMonthsKey, isMonthKey, monthOfDay, monthsEndingAt } from "@/lib/domain/costs/months";
import { todayIso } from "@/lib/domain/institutions/rules";
import { useUrlParam } from "@/lib/hooks/use-url-param";
import { formatMonth } from "./format";

export const MONTH_CHOICES = 24;

/** URL'deki `?month=YYYY-MM` (yoksa içinde bulunulan ay). Geçersiz değer bu aya düşer. */
export function useMonthParam(): [string, (month: string) => void] {
  const current = monthOfDay(todayIso());
  const [raw, setRaw] = useUrlParam("month", current);
  const month = isMonthKey(raw) ? raw : current;
  return [month, setRaw];
}

/** Ay seçici: önceki / sonraki ay düğmeleri + son 24 ay listesi. Gelecek aya geçilmez. */
export function MonthPicker({ value, onChange, id = "cost-month" }: { value: string; onChange: (month: string) => void; id?: string }) {
  const t = useTranslations("costs.common");
  const current = monthOfDay(todayIso());
  const options = useMemo(() => {
    const list = monthsEndingAt(current, MONTH_CHOICES).reverse();
    return list.includes(value) ? list : [value, ...list];
  }, [current, value]);
  return (
    <div className="flex items-center gap-1.5">
      <label htmlFor={id} className="sr-only">
        {t("month")}
      </label>
      <Button size="icon-sm" variant="outline" aria-label={t("previousMonth")} onClick={() => onChange(addMonthsKey(value, -1))}>
        <ChevronLeft />
      </Button>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((m) => (
            <SelectItem key={m} value={m}>
              {formatMonth(m)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="icon-sm" variant="outline" aria-label={t("nextMonth")} disabled={value >= current} onClick={() => onChange(addMonthsKey(value, 1))}>
        <ChevronRight />
      </Button>
    </div>
  );
}
