"use client";

import { useTranslations } from "next-intl";
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import { Link } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { CoverageNote } from "@/components/ui/coverage-note";
import { NEW_LIST, type ImportFlow, type ImportSummary } from "./use-import-flow";

function BigStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

/** CRM hedefinde sunucu ön kontrolü (dryRun) sonucu. */
function ServerCheckNote({ flow }: { flow: ImportFlow }) {
  const t = useTranslations("growth.import");
  const c = flow.serverCheck;
  if (c.state === "loading")
    return (
      <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        {t("checking")}
      </p>
    );
  if (c.state === "error") return <p className="text-xs text-destructive">{t("serverCheckFailed", { error: c.error ?? "" })}</p>;
  if (c.state === "done") return <CoverageNote>{t("serverCheck", { created: c.created, skipped: c.skipped })}</CoverageNote>;
  return null;
}

/** 4. adım: özet sayılar + hedefe göre uyarı; onayla. */
export function ConfirmStep({ flow }: { flow: ImportFlow }) {
  const t = useTranslations("growth.import");
  const tStatus = useTranslations("crm.status");
  const { plan } = flow;
  const nothing = plan.creates.length === 0 && plan.mergeIntoExisting.length === 0;
  const listName = flow.ctx.listNames.get(flow.listChoice) ?? "";
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 text-center">
        <BigStat label={t("plan.create")} value={plan.stats.create} />
        <BigStat label={t("plan.merge")} value={plan.stats.merged} />
        <BigStat label={t("plan.skip")} value={plan.stats.skipped} />
      </div>
      {flow.target === "crm" ? (
        <>
          <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{t("confirmCrm", { count: plan.creates.length, status: tStatus("ARANACAK") })}</span>
          </div>
          <ServerCheckNote flow={flow} />
        </>
      ) : (
        <CoverageNote>
          {t("confirmCold")}{" "}
          {flow.listChoice === NEW_LIST || !listName
            ? t("confirmNewList", { name: flow.newListName.trim() || flow.fileName })
            : t("confirmExistingList", { name: listName })}
        </CoverageNote>
      )}
      {plan.mergeIntoExisting.length > 0 && <CoverageNote>{t(flow.target === "crm" ? "mergeNoteCrm" : "mergeNoteCold")}</CoverageNote>}
      <DialogFooter className="sm:justify-between">
        <Button variant="ghost" onClick={() => flow.setStep("review")}>
          <ArrowLeft />
          {t("back")}
        </Button>
        <Button onClick={flow.start} disabled={nothing || flow.serverCheck.state === "loading"}>
          <CheckCircle2 />
          {flow.target === "crm" ? t("startCrm", { count: plan.creates.length }) : t("startCold")}
        </Button>
      </DialogFooter>
    </div>
  );
}

/** Son adım: sonuç, durdurulma, hatalar ve sunucunun eklemediği satırlar (nedenleriyle). */
export function DoneStep({ summary, onClose }: { summary: ImportSummary; onClose: () => void }) {
  const t = useTranslations("growth.import");
  return (
    <div className="space-y-4">
      <p className="flex items-center gap-2 text-sm font-medium">
        <CheckCircle2 className="h-5 w-5 text-success" aria-hidden />
        {t("summary", {
          created: summary.created,
          merged: summary.merged,
          skipped: summary.skipped + summary.serverSkipped.length,
        })}
      </p>
      {summary.stopped && <p className="text-sm text-warning">{t("stoppedNote", { count: summary.notSent })}</p>}
      {summary.failed.length > 0 && (
        <div className="space-y-1">
          <p className="text-sm text-destructive">{t("failedTitle", { count: summary.failed.length })}</p>
          <ul className="max-h-40 overflow-y-auto rounded-lg border border-border/60 p-2 text-xs">
            {summary.failed.map((f, i) => (
              <li key={i}>
                {f.label}: <span className="text-muted-foreground">{f.error}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {summary.serverSkipped.length > 0 && (
        <div className="space-y-1">
          <p className="text-sm text-warning">{t("serverSkippedTitle", { count: summary.serverSkipped.length })}</p>
          <ul className="max-h-40 overflow-y-auto rounded-lg border border-border/60 p-2 text-xs">
            {summary.serverSkipped.map((s, i) => (
              <li key={i}>{t("serverSkippedRow", { row: s.row, reason: t(`skipReasons.${s.reason}`) })}</li>
            ))}
          </ul>
        </div>
      )}
      <DialogFooter>
        {summary.target === "coldList" && summary.listId && (
          <Link
            href={`/crm/cold-lists?list=${encodeURIComponent(summary.listId)}`}
            onClick={onClose}
            className="inline-flex h-9 items-center rounded-lg px-4 text-sm font-medium hover:bg-accent"
          >
            {t("openList")}
          </Link>
        )}
        <Button onClick={onClose}>{t("close")}</Button>
      </DialogFooter>
    </div>
  );
}
