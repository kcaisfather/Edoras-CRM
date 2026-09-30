"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApiErrorMessage } from "@/lib/hooks/use-api-error-message";
import { costsApi, type CostExportKind } from "../../api";

/** Sunucunun ürettiği CSV'yi indirir (Excel TR: ";" ayraç + UTF-8 BOM). Hata olursa dosya yerine bildirim çıkar. */
export function ExportButton({ kind, month, variant = "outline" }: { kind: CostExportKind; month: string; variant?: "outline" | "default" }) {
  const t = useTranslations("costs.exports");
  const errorText = useApiErrorMessage();
  const [pending, setPending] = useState(false);

  const download = async () => {
    setPending(true);
    try {
      const blob = await costsApi.exportCsv(kind, month);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `maliyet-${kind}-${month}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t("downloadSuccess"));
    } catch (err) {
      toast.error(errorText(err, t("downloadFailed")));
    } finally {
      setPending(false);
    }
  };

  return (
    <Button size="sm" variant={variant} onClick={() => void download()} disabled={pending} aria-busy={pending}>
      {pending ? <Loader2 className="animate-spin" /> : <Download />}
      {pending ? t("downloading") : t("download")}
    </Button>
  );
}
