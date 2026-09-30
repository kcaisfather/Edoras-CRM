"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { COST_IMPORT_HEADERS, COST_IMPORT_TEMPLATE_ROWS, detectCostColumns, rowsFromCostTable, type CostImportRow } from "@/lib/domain/costs/import";
import { MAX_COST_IMPORT_ROWS } from "@/lib/domain/costs/schemas";
import { ImportFileError, IMPORT_ACCEPT, readImportFile } from "@/lib/import/parse";
import { useApiErrorMessage } from "@/lib/hooks/use-api-error-message";
import { downloadCsv } from "@/lib/utils/csv";
import type { CostImportResult } from "../../api";
import { useImportCostEntries } from "../../mutations";
import { formatLiraExact, formatMonth } from "../shared/format";

type Step = { kind: "pick" } | { kind: "review"; fileName: string; rows: CostImportRow[] } | { kind: "done"; result: CostImportResult; fileNumbers: number[] };

const PREVIEW_ROWS = 50;

/**
 * CSV / Excel içe aktarma (Hizmet, Ay, Tutar, Para birimi, Kur, Not): dosya tarayıcıda okunur, sütunlar başlıktan eşlenir, önizlemede
 * hatalı satırlar işaretlenir; yalnız geçerli satırlar gider. Sunucu her satırı yeniden doğrular ve aynı satırı (hizmet + ay + tutar +
 * para birimi + not) ikinci kez eklemez. En çok 5000 satır (500'erli parçalarla).
 */
export function CostImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations("costs.entries.import");
  const tSvc = useTranslations("costs.services.names");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("costs.errors");
  const errorText = useApiErrorMessage();
  const mutation = useImportCostEntries();
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>({ kind: "pick" });
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const close = (next: boolean) => {
    if (pending) return;
    onOpenChange(next);
    if (!next) {
      setStep({ kind: "pick" });
      setProblem(null);
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setProblem(null);
    try {
      const table = await readImportFile(file);
      const columns = detectCostColumns(table.headers);
      if (columns.service === undefined || columns.month === undefined || columns.amount === undefined) {
        setProblem(t("missingColumns"));
        return;
      }
      setStep({ kind: "review", fileName: file.name, rows: rowsFromCostTable(columns, table.rows, table.rowNumbers) });
    } catch (err) {
      setProblem(err instanceof ImportFileError ? t(`fileErrors.${err.code}`) : t("fileErrors.read"));
    }
  };

  const submit = async (rows: CostImportRow[]) => {
    const valid = rows.filter((r): r is CostImportRow & { value: NonNullable<CostImportRow["value"]> } => r.value !== null);
    setPending(true);
    setProblem(null);
    const total: CostImportResult = { created: 0, invalid: [], duplicates: [] };
    const fileNumbers = valid.map((r) => r.rowNumber);
    try {
      for (let i = 0; i < valid.length; i += MAX_COST_IMPORT_ROWS) {
        const chunk = valid.slice(i, i + MAX_COST_IMPORT_ROWS);
        const res = await mutation.mutateAsync(chunk.map((r) => r.value));
        total.created += res.created;
        // Sunucudaki 1 tabanlı sıra → toplam listedeki sıra.
        total.invalid.push(...res.invalid.map((n) => n + i));
        total.duplicates.push(...res.duplicates.map((n) => n + i));
      }
      setStep({ kind: "done", result: total, fileNumbers });
      if (total.created > 0) toast.success(t("created", { count: total.created }));
    } catch (err) {
      setProblem(errorText(err, tErrors("mutationFailed")));
      if (total.created > 0) setStep({ kind: "done", result: total, fileNumbers });
    } finally {
      setPending(false);
    }
  };

  const fileRow = (numbers: number[], list: number[]) => list.map((n) => numbers[n - 1]).filter((n): n is number => n !== undefined);

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {step.kind === "pick" ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-dashed border-border p-8 text-center">
              <FileSpreadsheet className="mx-auto mb-3 h-8 w-8 text-muted-foreground" aria-hidden />
              <p className="mb-3 text-sm text-muted-foreground">{t("columnsHint", { columns: COST_IMPORT_HEADERS.join(" · ") })}</p>
              <input ref={inputRef} type="file" accept={IMPORT_ACCEPT} className="sr-only" aria-label={t("chooseFile")} onChange={(e) => void onFile(e.target.files?.[0])} />
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button onClick={() => inputRef.current?.click()}>
                  <Upload />
                  {t("chooseFile")}
                </Button>
                <Button variant="outline" onClick={() => downloadCsv("maliyet-sablon", [...COST_IMPORT_HEADERS], COST_IMPORT_TEMPLATE_ROWS)}>
                  <Download />
                  {t("template")}
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{t("dedupeNote")}</p>
          </div>
        ) : null}

        {step.kind === "review" ? <ReviewStep rows={step.rows} fileName={step.fileName} tSvc={tSvc} /> : null}

        {step.kind === "done" ? (
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-sm font-medium">
              <CheckCircle2 className="h-5 w-5 text-success" />
              {t("result", { created: step.result.created, duplicates: step.result.duplicates.length, invalid: step.result.invalid.length })}
            </p>
            {step.result.duplicates.length > 0 ? <p className="text-xs text-muted-foreground">{t("duplicateRows", { rows: fileRow(step.fileNumbers, step.result.duplicates).slice(0, 30).join(", ") })}</p> : null}
            {step.result.invalid.length > 0 ? <p className="text-xs text-destructive">{t("invalidRows", { rows: fileRow(step.fileNumbers, step.result.invalid).slice(0, 30).join(", ") })}</p> : null}
          </div>
        ) : null}

        {problem ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{problem}</AlertDescription>
          </Alert>
        ) : null}

        <DialogFooter className="gap-2">
          {step.kind === "review" ? (
            <>
              <Button variant="outline" onClick={() => setStep({ kind: "pick" })} disabled={pending}>
                {t("back")}
              </Button>
              <Button onClick={() => void submit(step.rows)} disabled={pending || step.rows.every((r) => r.value === null)} aria-busy={pending}>
                {pending ? <Loader2 className="animate-spin" /> : <Upload />}
                {t("submit", { count: step.rows.filter((r) => r.value !== null).length })}
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => close(false)}>
              {step.kind === "done" ? t("close") : tCommon("cancel")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReviewStep({ rows, fileName, tSvc }: { rows: CostImportRow[]; fileName: string; tSvc: (key: string) => string }) {
  const t = useTranslations("costs.entries.import");
  const valid = rows.filter((r) => r.value !== null).length;
  const shown = [...rows.filter((r) => r.value === null), ...rows.filter((r) => r.value !== null)].slice(0, PREVIEW_ROWS);
  return (
    <div className="space-y-3">
      <p className="text-sm">
        <span className="font-medium">{fileName}</span> · {t("summary", { valid, invalid: rows.length - valid })}
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-14">{t("row")}</TableHead>
            <TableHead>{t("service")}</TableHead>
            <TableHead>{t("month")}</TableHead>
            <TableHead className="text-right">{t("amount")}</TableHead>
            <TableHead>{t("status")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((r) => (
            <TableRow key={r.rowNumber}>
              <TableCell className="font-mono text-xs text-muted-foreground">{r.rowNumber}</TableCell>
              <TableCell>{r.value ? tSvc(r.value.service) : "—"}</TableCell>
              <TableCell>{r.value ? formatMonth(r.value.month) : "—"}</TableCell>
              <TableCell className="text-right font-mono text-xs">{r.value ? `${formatLiraExact(r.value.amount).replace("₺", "")} ${r.value.currency === "USD" ? "$" : "₺"}` : "—"}</TableCell>
              <TableCell className={r.value ? "text-xs text-success" : "text-xs text-destructive"}>
                {r.value ? t("ok") : r.issues.map((i) => t(`issues.${i}`)).join(", ")}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {rows.length > PREVIEW_ROWS ? <p className="text-xs text-muted-foreground">{t("previewLimit", { count: PREVIEW_ROWS, total: rows.length })}</p> : null}
    </div>
  );
}
