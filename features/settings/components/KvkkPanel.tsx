"use client";

import { useTranslations } from "next-intl";
import { ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

type Sensitivity = "high" | "medium" | "low";
type Status = "done" | "partial" | "backend" | "legal";

/** Veri envanteri satırları (metinler shell.settings.kvkk.rows.*). */
const INVENTORY: { key: string; sensitivity: Sensitivity }[] = [
  { key: "billing", sensitivity: "high" },
  { key: "demoCredentials", sensitivity: "high" },
  { key: "institutionContact", sensitivity: "medium" },
  { key: "leads", sensitivity: "medium" },
  // Soğuk liste kişileri (crm_prospects): CRM'e girmemiş, içe aktarılmış kişisel veri.
  { key: "prospects", sensitivity: "medium" },
  { key: "payments", sensitivity: "medium" },
  { key: "institutionAdmins", sensitivity: "medium" },
  { key: "auditLog", sensitivity: "medium" },
  { key: "edorasUsage", sensitivity: "low" },
  { key: "staff", sensitivity: "low" },
  { key: "browserStorage", sensitivity: "low" },
];

/** Uyum kontrol listesi; durumlar bugünkü koda göre elle işaretlenir. */
const CHECKLIST: { key: string; status: Status }[] = [
  { key: "errorMasking", status: "done" },
  { key: "noLocalPii", status: "done" },
  { key: "agentMasking", status: "done" },
  { key: "rlsClosed", status: "done" },
  { key: "auditLog", status: "done" },
  { key: "exportLog", status: "partial" },
  { key: "dsar", status: "backend" },
  { key: "retention", status: "backend" },
  { key: "verbis", status: "legal" },
];

const SENSITIVITY_TONE: Record<Sensitivity, string> = {
  high: "bg-destructive/10 text-destructive",
  medium: "bg-warning/10 text-warning",
  low: "bg-muted text-muted-foreground",
};

const STATUS_TONE: Record<Status, string> = {
  done: "bg-success/10 text-success",
  partial: "bg-warning/10 text-warning",
  backend: "bg-primary/10 text-primary",
  legal: "bg-muted text-muted-foreground",
};

function Pill({ tone, children }: { tone: string; children: React.ReactNode }) {
  return <span className={cn("inline-block whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium", tone)}>{children}</span>;
}

/** G92 — KVKK MVP: salt okunur veri envanteri + uyum kontrol listesi. Hiçbir veri yazmaz. */
export function KvkkPanel() {
  const t = useTranslations("shell.settings.kvkk");

  return (
    <div className="space-y-6">
      <Card className="glass-panel rounded-2xl overflow-hidden">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-success/10 border border-success/20">
              <ShieldCheck className="h-5 w-5 text-success" />
            </div>
            <h2 className="flex items-center gap-1.5 text-lg font-bold">
              {t("title")}
              <InfoTip label={t("title")} align="start">
                {t("note")}
              </InfoTip>
            </h2>
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-2">
          <h3 className="text-sm font-semibold">{t("inventoryTitle")}</h3>
          <Table className="min-w-[860px]">
            <TableHeader>
              <TableRow>
                <TableHead>{t("cols.category")}</TableHead>
                <TableHead>{t("cols.fields")}</TableHead>
                <TableHead>{t("cols.screens")}</TableHead>
                <TableHead>{t("cols.stored")}</TableHead>
                <TableHead>{t("cols.sensitivity")}</TableHead>
                <TableHead>{t("cols.retention")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {INVENTORY.map((row) => (
                <TableRow key={row.key} className="align-top">
                  <TableCell className="font-medium">{t(`rows.${row.key}.category`)}</TableCell>
                  <TableCell className="text-muted-foreground">{t(`rows.${row.key}.fields`)}</TableCell>
                  <TableCell className="text-muted-foreground">{t(`rows.${row.key}.screens`)}</TableCell>
                  <TableCell className="text-muted-foreground">{t(`rows.${row.key}.stored`)}</TableCell>
                  <TableCell>
                    <Pill tone={SENSITIVITY_TONE[row.sensitivity]}>{t(`sensitivity.${row.sensitivity}`)}</Pill>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{t(`rows.${row.key}.retention`)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="glass-panel rounded-2xl overflow-hidden">
        <CardHeader className="pb-2">
          <h3 className="text-base font-semibold">{t("checklistTitle")}</h3>
        </CardHeader>
        <CardContent className="pt-0">
          <ul className="divide-y divide-border/60">
            {CHECKLIST.map((item) => (
              <li key={item.key} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-start sm:gap-3">
                <span className="sm:w-32 sm:shrink-0">
                  <Pill tone={STATUS_TONE[item.status]}>{t(`status.${item.status}`)}</Pill>
                </span>
                <span className="text-sm">{t(`checklist.${item.key}`)}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
