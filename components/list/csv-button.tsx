"use client";

import { useTranslations } from "next-intl";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadCsv, dropColumns, type CsvCell } from "@/lib/utils/csv";
import { usePermissions } from "@/features/auth";

/**
 * CSV indir. `financialColumns`: tutar içeren sütun indeksleri — finansal yetkisi olmayan (CRM_AGENT)
 * kullanıcının dosyasından çıkarılır.
 * (DeepSportAdmin'deki "İçe aktar" düğmesi içe aktarma modülü taşınınca geri eklenir.)
 */
export function CsvButton({
  filename,
  header,
  rows,
  financialColumns = [],
}: {
  filename: string;
  header: string[];
  rows: () => CsvCell[][];
  financialColumns?: readonly number[];
}) {
  const t = useTranslations("list");
  const { canSeeFinancials } = usePermissions();
  const download = () => {
    const [h, r] = dropColumns(header, rows(), canSeeFinancials ? [] : financialColumns);
    downloadCsv(filename, h, r);
  };
  return (
    <Button size="sm" variant="outline" onClick={download}>
      <Download />
      {t("csv")}
    </Button>
  );
}
