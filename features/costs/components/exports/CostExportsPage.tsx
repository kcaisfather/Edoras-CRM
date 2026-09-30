"use client";

import { useTranslations } from "next-intl";
import type { CostExportKind } from "../../api";
import { CostPanel } from "../shared/CostStates";
import { MonthPicker, useMonthParam } from "../shared/MonthPicker";
import { formatMonth } from "../shared/format";
import { ExportButton } from "./ExportButton";

const ITEMS: { kind: CostExportKind; usesMonth: boolean }[] = [
  { kind: "entries", usesMonth: false },
  { kind: "services", usesMonth: true },
  { kind: "trend", usesMonth: true },
  { kind: "institutions", usesMonth: true },
];

/** Maliyetler → Dışa aktar (DeepSport CostExportsPage): defter, hizmet × ay, eğilim ve kurum maliyetleri CSV. */
export function CostExportsPage() {
  const t = useTranslations("costs.exports");
  const [month, setMonth] = useMonthParam();
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <MonthPicker value={month} onChange={setMonth} />
        <p className="text-xs text-muted-foreground">{t("monthNote", { month: formatMonth(month) })}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6">
        {ITEMS.map((item) => (
          <CostPanel key={item.kind} orb="vision-card-orb-emerald" title={t(`${item.kind}Title`)} description={t(`${item.kind}Description`)}>
            <ExportButton kind={item.kind} month={month} variant="default" />
            <p className="mt-2 text-[11px] text-muted-foreground">{item.usesMonth ? t("usesMonth") : t("allMonths")}</p>
          </CostPanel>
        ))}
      </div>
    </div>
  );
}
