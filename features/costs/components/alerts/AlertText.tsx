"use client";

import { useTranslations } from "next-intl";
import type { CostAlert } from "@/lib/domain/costs/types";
import { formatLira, formatPct } from "../shared/format";

/** Hesaplanmış uyarının Türkçe cümlesi (uyarı saklanmadığı için metin de burada kurulur). */
export function AlertText({ alert }: { alert: CostAlert }) {
  const t = useTranslations("costs.alerts");
  const tSvc = useTranslations("costs.services.names");
  return (
    <>
      {t(`messages.${alert.type}`, {
        scope: alert.service ? tSvc(alert.service) : t("allServices"),
        current: formatLira(alert.currentTry),
        threshold: formatLira(alert.thresholdTry),
        pct: formatPct(alert.pct, 0),
      })}
    </>
  );
}
