"use client";

import { useRef, type ChangeEvent, type DragEvent } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, ArrowLeft, ArrowRight, FileSpreadsheet, FileUp, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { CoverageNote } from "@/components/ui/coverage-note";
import { IMPORT_ACCEPT } from "@/lib/import/parse";
import { IMPORT_FIELDS, hasIdentityField, sampleValue, type ColumnMapping, type ImportField } from "@/lib/import/fields";
import { downloadImportTemplate } from "@/lib/import/template";
import type { ImportFlow, ImportTarget } from "./use-import-flow";

const SELECT_CLASS = "h-9 w-full rounded-lg border border-input bg-background px-2 text-sm";

/** 1. adım: hedef (birden fazlaysa) ve dosya. Dosya tarayıcıda okunur. */
export function FileStep({
  flow,
  targets,
  onCancel,
}: {
  flow: ImportFlow;
  targets: readonly ImportTarget[];
  onCancel: () => void;
}) {
  const t = useTranslations("growth.import");
  const inputRef = useRef<HTMLInputElement>(null);
  const pick = (file: File | undefined) => {
    void flow.handleFile(file).finally(() => {
      if (inputRef.current) inputRef.current.value = "";
    });
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    pick(e.dataTransfer.files?.[0]);
  };
  return (
    <div className="space-y-4">
      {targets.length > 1 && (
        <div className="space-y-1.5">
          <Label>{t("targetLabel")}</Label>
          <div>
            <SegmentedControl<ImportTarget>
              value={flow.target}
              onValueChange={flow.setTarget}
              options={targets.map((v) => ({ value: v, label: t(`targets.${v}`) }))}
              aria-label={t("targetLabel")}
            />
          </div>
        </div>
      )}
      <CoverageNote>{t(`targetHints.${flow.target}`)}</CoverageNote>
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-muted/30 px-4 py-10 text-center"
      >
        <FileUp className="h-8 w-8 text-muted-foreground" aria-hidden />
        <p className="text-sm">{t("dropHint")}</p>
        <p className="text-xs text-muted-foreground">{t("formats")}</p>
        <input
          ref={inputRef}
          type="file"
          accept={IMPORT_ACCEPT}
          className="hidden"
          onChange={(e: ChangeEvent<HTMLInputElement>) => pick(e.target.files?.[0])}
        />
        <Button onClick={() => inputRef.current?.click()} disabled={flow.reading}>
          {flow.reading ? <Loader2 className="animate-spin" /> : <Upload />}
          {flow.reading ? t("reading") : t("chooseFile")}
        </Button>
      </div>
      {flow.fileError && (
        <p className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {flow.fileError}
        </p>
      )}
      <DialogFooter className="sm:justify-between">
        <Button variant="ghost" onClick={downloadImportTemplate}>
          <FileSpreadsheet />
          {t("template")}
        </Button>
        <Button variant="outline" onClick={onCancel}>
          {t("cancel")}
        </Button>
      </DialogFooter>
    </div>
  );
}

/** 2. adım: sütun → alan eşlemesi (otomatik tahmin edilmiş; aynı sütun iki alana eşlenmez). */
export function MapStep({ flow }: { flow: ImportFlow }) {
  const t = useTranslations("growth.import");
  const table = flow.table;
  if (!table) return null;
  const mapping = flow.mapping;
  const canContinue = hasIdentityField(mapping);
  const usedBy = new Map<number, ImportField>();
  for (const f of IMPORT_FIELDS) if (mapping[f] != null) usedBy.set(mapping[f] as number, f);
  const setField = (field: ImportField, v: number | undefined) =>
    flow.setMapping((m) => {
      const next: ColumnMapping = { ...m };
      if (v != null) for (const f of IMPORT_FIELDS) if (next[f] === v) delete next[f];
      if (v == null) delete next[field];
      else next[field] = v;
      return next;
    });
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {t("mapIntro", { file: flow.fileName, rows: table.rows.length, columns: table.headers.length })}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {IMPORT_FIELDS.map((field) => {
          const col = mapping[field];
          return (
            <div key={field} className="space-y-1">
              <Label htmlFor={`map-${field}`} className="text-xs">
                {t(`fields.${field}`)}
              </Label>
              <select
                id={`map-${field}`}
                value={col ?? ""}
                onChange={(e) => setField(field, e.target.value === "" ? undefined : Number(e.target.value))}
                className={SELECT_CLASS}
              >
                <option value="">{t("notMapped")}</option>
                {table.headers.map((h, i) => (
                  <option key={i} value={i}>
                    {h}
                    {usedBy.has(i) && usedBy.get(i) !== field ? ` (${t(`fields.${usedBy.get(i)}`)})` : ""}
                  </option>
                ))}
              </select>
              <p className="truncate text-xs text-muted-foreground">
                {col != null ? t("sample", { value: sampleValue(table, col) || "—" }) : " "}
              </p>
            </div>
          );
        })}
      </div>
      <CoverageNote>{t("fullNameHint")}</CoverageNote>
      {flow.target === "crm" && <CoverageNote>{t("crmFieldsHint")}</CoverageNote>}
      {!canContinue && <p className="text-sm text-destructive">{t("needIdentity")}</p>}
      <DialogFooter className="sm:justify-between">
        <Button variant="ghost" onClick={() => flow.setStep("file")}>
          <ArrowLeft />
          {t("back")}
        </Button>
        <Button onClick={() => flow.setStep("review")} disabled={!canContinue}>
          {t("next")}
          <ArrowRight />
        </Button>
      </DialogFooter>
    </div>
  );
}
