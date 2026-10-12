"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { AlertTriangle, CalendarCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/features/auth";
import { daysBetween, todayIso } from "@/lib/domain/institutions/rules";
import { demoLengthDays, isValidDemoEnd } from "@/lib/domain/institutions/demo-duration";
import { demoEditSchemaFor, type DemoEditInput } from "@/lib/domain/institutions/schemas";
import type { InstitutionDetail } from "@/lib/domain/institutions/types";
import { useUpdateDemoEnd } from "../mutations";
import { formatDate } from "../format";
import { applyServerFieldErrors } from "./fields";
import { DemoEndField } from "./DemoEndField";
import { FormDialog } from "./FormDialog";

const EMPTY: DemoEditInput = { demoEndsOn: "" };

/**
 * Demo kartının "Bitişi değiştir" düğmesi + penceresi — yalnız ADMIN (kurucu kararı 2026-10-12; uç da 403 verir).
 * Yalnız açık (DEMO) kurumda görünür.
 */
export function DemoEndAction({ institution }: { institution: InstitutionDetail }) {
  const t = useTranslations("institutions.demoDuration.edit");
  const { isAdmin } = usePermissions();
  const [open, setOpen] = useState(false);
  const crm = institution.crm;
  if (!isAdmin || crm?.status !== "DEMO" || !crm.demoStartedAt || !crm.demoEndsAt) return null;
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <CalendarCog />
        {t("button")}
      </Button>
      <DemoEndDialog
        institutionId={institution.id}
        startedAt={crm.demoStartedAt.slice(0, 10)}
        endsAt={crm.demoEndsAt}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}

/**
 * Açık demonun bitişini uzatır ya da kısaltır. Hızlı seçimler bugünden sayılır (demo henüz başlamadıysa başlangıçtan);
 * özel tarih de girilebilir. Bitiş başlangıçtan sonra olmalı; bugün ya da öncesi seçilirse demo hemen bitmiş sayılır
 * (uyarı gösterilir, kurum kapanmaz). Hiçbir süre önceden seçili gelmez.
 */
function DemoEndDialog({
  institutionId,
  startedAt,
  endsAt,
  open,
  onOpenChange,
}: {
  institutionId: string;
  startedAt: string;
  endsAt: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("institutions.demoDuration.edit");
  const mutation = useUpdateDemoEnd(institutionId);
  const schema = useMemo(() => demoEditSchemaFor(startedAt), [startedAt]);
  const form = useForm<DemoEditInput>({ resolver: zodResolver(schema), defaultValues: EMPTY });
  const value = useWatch({ control: form.control, name: "demoEndsOn" });

  useEffect(() => {
    if (open) {
      form.reset(EMPTY);
      mutation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const today = todayIso();
  const choicesFrom = startedAt > today ? startedAt : today;
  const left = (end: string) => {
    const days = daysBetween(today, end);
    return days > 0 ? t("left.days", { days }) : days === 0 ? t("left.today") : t("left.ended", { days: -days });
  };
  const endsInPast = isValidDemoEnd(startedAt, value) && value <= today;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("title")}
      description={t("description")}
      form={form}
      submitLabel={t("submit")}
      pending={mutation.isPending}
      error={mutation.error}
      onSubmit={(input) => {
        if (input.demoEndsOn === endsAt) {
          form.setError("demoEndsOn", { type: "validate", message: t("unchanged") });
          return;
        }
        mutation.mutate(input, {
          onSuccess: () => {
            toast.success(t("saved"));
            onOpenChange(false);
          },
          onError: (err) => applyServerFieldErrors(form, err),
        });
      }}
    >
      <dl className="grid grid-cols-2 gap-4 rounded-xl border border-border bg-muted/30 p-3 text-sm">
        <div className="min-w-0">
          <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t("started")}</dt>
          <dd className="mt-0.5">{formatDate(startedAt)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t("currentEnd")}</dt>
          <dd className="mt-0.5">
            {formatDate(endsAt)} <span className="text-muted-foreground">· {left(endsAt)}</span>
          </dd>
        </div>
      </dl>
      <DemoEndField
        label={t("label")}
        startsOn={startedAt}
        choicesFrom={choicesFrom}
        hint={t("hint")}
        summary={(end) => t("summary", { date: formatDate(end), left: left(end), days: demoLengthDays(startedAt, end) })}
      />
      {endsInPast ? (
        <p className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t("endsInPast")}
        </p>
      ) : null}
    </FormDialog>
  );
}
