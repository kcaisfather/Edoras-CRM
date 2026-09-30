"use client";

import { useLocale, useTranslations } from "next-intl";
import { CalendarClock, Save } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { InfoTip } from "@/components/ui/info-tip";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QueryErrorState } from "@/components/query-error-state";
import { displayName, type StaffMember } from "@/lib/domain/staff/logic";
import { nextRunAt } from "@/lib/domain/reports/schedule";
import { FINANCIAL_REPORT_SECTIONS, MAX_REPORT_RECIPIENTS, REPORT_FREQUENCIES, REPORT_SECTIONS, type ReportFrequency, type ReportSection } from "@/lib/domain/reports/types";
import { cn } from "@/lib/utils";
import { validateDraft, type ReportDraft } from "../draft";

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
const MONTH_DAYS = Array.from({ length: 28 }, (_, i) => i + 1);

export interface ReportEditorProps {
  draft: ReportDraft;
  onChange: (patch: Partial<ReportDraft>) => void;
  /** Ekip listesi (yönetici); alıcı yalnız buradan seçilir. */
  members: { all: StaffMember[]; loading: boolean; error: boolean; retry: () => void };
  showErrors: boolean;
  pending: boolean;
  onSave: () => void;
  onCancel: () => void;
}

/**
 * Rapor formu (DeepSport ReportsPanel'in düzenleyici kısmı). Alıcı seçici: aktif CRM personeli — serbest e-posta yoktur.
 * Kaydet bir onay diyaloğu açar (üst bileşen); burada yalnız form ve doğrulama gösterimi var.
 */
export function ReportEditor({ draft, onChange, members, showErrors, pending, onSave, onCancel }: ReportEditorProps) {
  const t = useTranslations("settingsx.reports");
  const locale = useLocale();

  const active = members.all.filter((m) => m.status === "ACTIVE");
  const byId = new Map(members.all.map((m) => [m.id, m]));
  const errors = validateDraft(draft);
  const next = nextRunAt({ frequency: draft.frequency, time: draft.time, weekday: draft.weekday, dayOfMonth: draft.dayOfMonth });

  const toggleRecipient = (id: string, on: boolean) =>
    onChange({ recipientIds: on ? [...draft.recipientIds, id] : draft.recipientIds.filter((r) => r !== id) });
  const toggleSection = (s: ReportSection, on: boolean) =>
    onChange({ sections: REPORT_SECTIONS.filter((x) => (x === s ? on : draft.sections.includes(x))) });

  const when =
    next == null
      ? "—"
      : new Intl.DateTimeFormat(locale, { timeZone: "Europe/Istanbul", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(next);

  return (
    <Card className="glass-panel rounded-2xl overflow-hidden">
      <CardHeader className="pb-2">
        <h3 className="text-base font-semibold">{draft.id ? t("editTitleEdit") : t("editTitleNew")}</h3>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="report-name" className="text-sm font-medium">
            {t("name")}
          </Label>
          <Input
            id="report-name"
            value={draft.name}
            maxLength={100}
            placeholder={t("namePlaceholder")}
            onChange={(e) => onChange({ name: e.target.value })}
            aria-invalid={showErrors && errors.includes("nameRequired")}
            className="max-w-sm"
          />
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t("recipients")}</legend>
          {members.loading ? (
            <Skeleton className="h-16 w-full rounded-xl" />
          ) : members.error ? (
            <QueryErrorState onRetry={members.retry} />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {active.map((m) => (
                <label key={m.id} className="flex items-start gap-2 rounded-lg border border-border/60 p-2.5 text-sm cursor-pointer hover:bg-accent/40">
                  <Checkbox checked={draft.recipientIds.includes(m.id)} onCheckedChange={(v) => toggleRecipient(m.id, v === true)} className="mt-0.5" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{displayName(m)}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {m.email}
                      {m.role !== "ADMIN" && ` · ${t("recipientsNoAmounts")}`}
                    </span>
                  </span>
                </label>
              ))}
              {draft.recipientIds
                .filter((id) => !active.some((m) => m.id === id))
                .map((id) => (
                  <label key={id} className="flex items-start gap-2 rounded-lg border border-dashed border-border/60 p-2.5 text-sm cursor-pointer">
                    <Checkbox checked onCheckedChange={() => toggleRecipient(id, false)} className="mt-0.5" />
                    <span className="min-w-0 text-xs text-muted-foreground">
                      {byId.get(id) ? displayName(byId.get(id) as StaffMember) : "—"} · {t("recipientDisabled")}
                    </span>
                  </label>
                ))}
            </div>
          )}
          <p className={cn("text-xs text-muted-foreground", showErrors && errors.includes("noRecipients") && "text-destructive")}>
            {t("recipientsHelp", { count: draft.recipientIds.length })} ({draft.recipientIds.length}/{MAX_REPORT_RECIPIENTS})
          </p>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-[auto_auto_1fr] sm:items-end">
          <div className="space-y-2">
            <p className="text-sm font-medium">{t("frequency")}</p>
            <SegmentedControl<ReportFrequency>
              value={draft.frequency}
              onValueChange={(v) => onChange({ frequency: v })}
              options={REPORT_FREQUENCIES.map((f) => ({ value: f, label: t(`frequencies.${f}`) }))}
              aria-label={t("frequency")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="report-time" className="text-sm font-medium">
              {t("time")}
            </Label>
            <Input
              id="report-time"
              type="time"
              value={draft.time}
              onChange={(e) => onChange({ time: e.target.value })}
              className="w-32"
              aria-invalid={showErrors && errors.includes("invalidTime")}
            />
          </div>
          {draft.frequency === "WEEKLY" && (
            <div className="space-y-2">
              <p className="text-sm font-medium" id="report-weekday-label">
                {t("weekday")}
              </p>
              <Select value={String(draft.weekday)} onValueChange={(v) => onChange({ weekday: Number(v) })}>
                <SelectTrigger className="w-44" aria-labelledby="report-weekday-label">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WEEKDAYS.map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {t(`weekdays.${d}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {draft.frequency === "MONTHLY" && (
            <div className="space-y-2">
              <p className="text-sm font-medium" id="report-day-label">
                {t("dayOfMonth")}
              </p>
              <Select value={String(draft.dayOfMonth)} onValueChange={(v) => onChange({ dayOfMonth: Number(v) })}>
                <SelectTrigger className="w-32" aria-labelledby="report-day-label">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTH_DAYS.map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {t("dayN", { day: d })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarClock className="h-3.5 w-3.5" aria-hidden />
          {t("nextRun", { when })}
          {draft.frequency === "MONTHLY" && <span>· {t("monthlyNote")}</span>}
        </p>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t("sections")}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {REPORT_SECTIONS.map((s) => (
              <label key={s} className="flex items-start gap-2 rounded-lg border border-border/60 p-2.5 text-sm cursor-pointer hover:bg-accent/40">
                <Checkbox checked={draft.sections.includes(s)} onCheckedChange={(v) => toggleSection(s, v === true)} className="mt-0.5" />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 font-medium">
                    {t(`sectionLabels.${s}`)}
                    <InfoTip label={t(`sectionLabels.${s}`)}>{t(`sectionHints.${s}`)}</InfoTip>
                  </span>
                  {FINANCIAL_REPORT_SECTIONS.includes(s) && <span className="block text-xs text-muted-foreground">{t("financial")}</span>}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={draft.active} onCheckedChange={(v) => onChange({ active: v === true })} />
          {t("active")}
        </label>

        {showErrors && errors.length > 0 && (
          <ul className="space-y-0.5 text-xs text-destructive" role="alert">
            {errors.map((e) => (
              <li key={e}>{t(`errors.${e}`)}</li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={onSave} disabled={pending}>
            <Save />
            {t("save")}
          </Button>
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            {t("cancel")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
