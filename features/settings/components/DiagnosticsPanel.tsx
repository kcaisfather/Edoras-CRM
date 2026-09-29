"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Bug, Copy, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  MAX_ERRORS,
  clearClientDiagnostics,
  readClientErrors,
  readRequestStats,
  subscribeClientDiagnostics,
  type ClientErrorEntry,
  type RequestStat,
} from "@/lib/monitoring/client-errors";

/** G37 — Bu sekmede yakalanan hatalar ve sayfa başına istek hacmi (sessionStorage). */
export function DiagnosticsPanel() {
  const t = useTranslations("shell.settings.diagnostics");
  const locale = useLocale();
  const [errors, setErrors] = useState<ClientErrorEntry[]>([]);
  const [stats, setStats] = useState<RequestStat[]>([]);

  useEffect(() => {
    const load = () => {
      setErrors(readClientErrors());
      setStats(readRequestStats());
    };
    load();
    return subscribeClientDiagnostics(load);
  }, []);

  const fmtTime = (ms: number) =>
    new Date(ms).toLocaleString(locale === "tr" ? "tr-TR" : "en-GB", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(errors, null, 2));
      toast.success(t("copied"));
    } catch {
      /* pano izni yok */
    }
  };

  return (
    <div className="space-y-6">
      <Card className="glass-panel rounded-2xl overflow-hidden">
        <CardHeader className="pb-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20">
                <Bug className="h-5 w-5 text-destructive" />
              </div>
              <h2 className="flex items-center gap-1.5 text-lg font-bold">
                {t("title")}
                <InfoTip label={t("title")} align="start">
                  {t("description", { count: MAX_ERRORS })} {t("note")}
                </InfoTip>
              </h2>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={copy} disabled={errors.length === 0}>
                <Copy />
                {t("copy")}
              </Button>
              <Button variant="outline" size="sm" onClick={clearClientDiagnostics} disabled={errors.length === 0 && stats.length === 0}>
                <Trash2 />
                {t("clear")}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          {errors.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {errors.map((e, i) => (
                <li key={`${e.at}-${i}`} className="py-2">
                  <details>
                    <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm">
                      <span className="text-xs tabular-nums text-muted-foreground">{fmtTime(e.at)}</span>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{t(`sources.${e.source}`)}</span>
                      <span className="font-mono text-xs text-muted-foreground">{e.path}</span>
                      <span className="min-w-0 basis-full truncate">{e.name}: {e.message}</span>
                    </summary>
                    {(e.stack || e.digest) && (
                      <pre className="mt-2 overflow-x-auto rounded-md bg-muted/60 p-2 text-[11px] leading-snug text-muted-foreground">
                        {e.digest ? `digest: ${e.digest}\n` : ""}
                        {e.stack}
                      </pre>
                    )}
                  </details>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="glass-panel rounded-2xl overflow-hidden">
        <CardHeader className="pb-2">
          <h2 className="text-base font-semibold">{t("requestsTitle")}</h2>
        </CardHeader>
        <CardContent className="pt-0">
          {stats.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("requestsEmpty")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("page")}</TableHead>
                  <TableHead className="text-right">{t("count")}</TableHead>
                  <TableHead className="text-right">{t("avg")}</TableHead>
                  <TableHead className="text-right">{t("max")}</TableHead>
                  <TableHead className="text-right">{t("failed")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.map((s) => (
                  <TableRow key={s.path}>
                    <TableCell className="font-mono text-xs">{s.path}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.count}</TableCell>
                    <TableCell className="text-right tabular-nums">{Math.round(s.totalMs / Math.max(1, s.count))} ms</TableCell>
                    <TableCell className="text-right tabular-nums">{s.maxMs} ms</TableCell>
                    <TableCell className="text-right tabular-nums">{s.failed || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
