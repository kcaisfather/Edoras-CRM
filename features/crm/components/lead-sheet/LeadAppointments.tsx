"use client";

/**
 * Aday panelinin "Randevular" bölümü: sıradaki açık randevu (tarih · saat · Online / Yüz yüze, link ya da yer),
 * Düzenle (yeniden planla), sonuç (Gerçekleşti / Gelmedi / İptal), Takvime ekle (.ics) ve "Randevu ekle".
 * Sonuçlanmış randevular "Geçmiş" altında salt okunur listelenir. Kurallar sunucuda ve veritabanında da zorunlu.
 */
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { CalendarClock, CalendarPlus, Check, Loader2, MapPin, Pencil, UserX, Video, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { cn } from "@/lib/utils";
import { useApiErrorMessage } from "@/lib/hooks/use-api-error-message";
import type { CrmLead } from "@/lib/domain/crm/types";
import { getLeadDisplayName } from "@/lib/domain/crm/utils";
import {
  appointmentTimes,
  defaultAppointmentDraft,
  draftFromAppointment,
  draftToAppointment,
  formatAppointmentWhen,
  isAppointmentOverdue,
  nextAppointment,
  validateAppointmentDraft,
  type AppointmentDraft,
  type AppointmentDraftError,
  type AppointmentDto,
  type AppointmentMode,
  type AppointmentOutcome,
} from "@/lib/domain/crm/appointment";
import { downloadAppointmentIcs, useCreateAppointment, useLeadAppointments, useUpdateAppointment } from "../../appointments";
import { LeadSection } from "./LeadSheetSections";

const TIMES = appointmentTimes();
const TEXTAREA_CLASS =
  "flex min-h-[56px] w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 md:text-sm";

function ModeBadge({ mode }: { mode: AppointmentMode }) {
  const t = useTranslations("crm.appointment.modes");
  const Icon = mode === "ONLINE" ? Video : MapPin;
  return (
    <span className="inline-flex w-fit items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
      <Icon className="size-3" aria-hidden />
      {t(mode)}
    </span>
  );
}

function Where({ a }: { a: Pick<AppointmentDto, "mode" | "link" | "location"> }) {
  const t = useTranslations("crm.appointment");
  if (a.mode === "ONLINE" && a.link) {
    return (
      <a href={a.link} target="_blank" rel="noopener noreferrer" className="max-w-[18rem] truncate text-xs text-primary underline-offset-2 hover:underline" title={a.link}>
        {t("joinLink")}
      </a>
    );
  }
  if (a.mode === "IN_PERSON" && a.location) {
    return (
      <span className="max-w-[18rem] truncate text-xs text-muted-foreground" title={a.location}>
        {a.location}
      </span>
    );
  }
  return null;
}

/** Randevu formu (kontrollü): tarih, saat (15 dk), tür, türe göre link / yer ve not. */
function AppointmentForm({
  idPrefix,
  value,
  onChange,
  error,
  disabled,
}: {
  idPrefix: string;
  value: AppointmentDraft;
  onChange: (next: AppointmentDraft) => void;
  error: AppointmentDraftError | null;
  disabled?: boolean;
}) {
  const t = useTranslations("crm.appointment");
  const set = <K extends keyof AppointmentDraft>(key: K, v: AppointmentDraft[K]) => onChange({ ...value, [key]: v });
  const times = TIMES.includes(value.time) || !value.time ? TIMES : [value.time, ...TIMES];
  const dateErr = error === "date" || error === "past";
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-date`}>{t("date")}</Label>
          <Input id={`${idPrefix}-date`} type="date" value={value.date} onChange={(e) => set("date", e.target.value)} disabled={disabled} aria-invalid={dateErr || undefined} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-time`}>{t("time")}</Label>
          <Select value={value.time} onValueChange={(v) => set("time", v)} disabled={disabled}>
            <SelectTrigger id={`${idPrefix}-time`} className="w-full" aria-invalid={error === "time" || undefined}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              {times.map((x) => (
                <SelectItem key={x} value={x}>
                  {x}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2 space-y-1.5 sm:col-span-1">
          <span className="text-sm font-medium leading-none">{t("mode")}</span>
          <SegmentedControl<AppointmentMode>
            aria-label={t("mode")}
            value={value.mode}
            onValueChange={(v) => set("mode", v)}
            className="flex w-full"
            itemClassName="flex-1"
            options={[
              { value: "ONLINE", label: t("modes.ONLINE"), icon: <Video />, disabled },
              { value: "IN_PERSON", label: t("modes.IN_PERSON"), icon: <MapPin />, disabled },
            ]}
          />
        </div>
      </div>
      {value.mode === "ONLINE" ? (
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-link`}>{t("link")}</Label>
          <Input
            id={`${idPrefix}-link`}
            type="url"
            inputMode="url"
            value={value.link}
            onChange={(e) => set("link", e.target.value)}
            placeholder={t("linkPlaceholder")}
            disabled={disabled}
            aria-invalid={error === "link" || undefined}
          />
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-location`}>{t("location")}</Label>
          <Input id={`${idPrefix}-location`} value={value.location} onChange={(e) => set("location", e.target.value)} placeholder={t("locationPlaceholder")} disabled={disabled} />
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-note`}>{t("note")}</Label>
        <textarea id={`${idPrefix}-note`} className={TEXTAREA_CLASS} value={value.note} onChange={(e) => set("note", e.target.value)} maxLength={2000} disabled={disabled} />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {t(`errors.${error}`)}
        </p>
      )}
    </div>
  );
}

/** Yeni randevu (appointment yok) ya da düzenleme (appointment verilir). */
function AppointmentDialog({ lead, appointment, onClose }: { lead: CrmLead; appointment: AppointmentDto | null; onClose: () => void }) {
  const t = useTranslations("crm.appointment");
  const tCommon = useTranslations("common");
  const errorMessage = useApiErrorMessage();
  const create = useCreateAppointment();
  const update = useUpdateAppointment();
  const [draft, setDraft] = useState<AppointmentDraft>(() =>
    appointment ? draftFromAppointment(appointment, appointment.note ?? "") : defaultAppointmentDraft(lead)
  );
  const [error, setError] = useState<AppointmentDraftError | null>(null);
  const pending = create.isPending || update.isPending;

  const save = async () => {
    const problem = validateAppointmentDraft(draft);
    setError(problem);
    if (problem) return;
    const a = draftToAppointment(draft);
    const body = { date: a.date, time: a.time, mode: a.mode, link: a.link ?? "", location: a.location ?? "", note: draft.note };
    try {
      if (appointment) await update.mutateAsync({ id: appointment.id, data: body });
      else await create.mutateAsync({ leadId: lead.id, ...body });
      toast.success(t(appointment ? "rescheduled" : "created"));
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, t("saveError")));
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(appointment ? "editTitle" : "addTitle")}</DialogTitle>
          <DialogDescription>{getLeadDisplayName(lead)}</DialogDescription>
        </DialogHeader>
        <AppointmentForm idPrefix="appt" value={draft} onChange={setDraft} error={error} disabled={pending} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            {tCommon("cancel")}
          </Button>
          <Button onClick={save} disabled={pending} aria-busy={pending}>
            {pending && <Loader2 className="animate-spin" />}
            {t(appointment ? "reschedule" : "add")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function LeadAppointments({ lead }: { lead: CrmLead }) {
  const t = useTranslations("crm.appointment");
  const locale = useLocale();
  const errorMessage = useApiErrorMessage();
  const query = useLeadAppointments(lead.id);
  const update = useUpdateAppointment();
  const [dialog, setDialog] = useState<{ appointment: AppointmentDto | null } | null>(null);
  const [closing, setClosing] = useState<{ appointment: AppointmentDto; outcome: AppointmentOutcome } | null>(null);

  const all = query.data ?? [];
  const open = all.filter((a) => a.status === "SCHEDULED");
  const past = all.filter((a) => a.status !== "SCHEDULED").sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`));
  const next = nextAppointment(open);
  const title = getLeadDisplayName(lead);

  const close = async () => {
    if (!closing) return;
    try {
      await update.mutateAsync({ id: closing.appointment.id, data: { status: closing.outcome } });
      toast.success(t("closed"));
      setClosing(null);
    } catch (err) {
      toast.error(errorMessage(err, t("saveError")));
    }
  };

  return (
    <LeadSection title={t("title")}>
      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      ) : query.isError ? (
        <p className="text-sm text-destructive">{t("loadError")}</p>
      ) : open.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("none")}</p>
      ) : (
        <ul className="space-y-2">
          {open.map((a) => {
            const overdue = isAppointmentOverdue(a);
            return (
              <li key={a.id} className={cn("space-y-1.5 rounded-lg border border-border/60 bg-muted/30 p-2.5", overdue && "border-destructive/40")}>
                <div className="flex flex-wrap items-center gap-2">
                  <CalendarClock className="size-4 text-primary" aria-hidden />
                  <span className="text-sm font-medium tabular-nums">{formatAppointmentWhen(a, locale)}</span>
                  <ModeBadge mode={a.mode} />
                  {next?.id === a.id && open.length > 1 && <span className="text-xs text-muted-foreground">{t("next")}</span>}
                  {overdue && <span className="text-xs font-medium text-destructive">{t("overdue")}</span>}
                </div>
                <Where a={a} />
                {a.assigneeName && <p className="text-xs text-muted-foreground">{t("assignee", { name: a.assigneeName })}</p>}
                {a.note && <p className="whitespace-pre-wrap break-words text-sm">{a.note}</p>}
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  <Button size="sm" variant="outline" onClick={() => setDialog({ appointment: a })}>
                    <Pencil />
                    {t("edit")}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setClosing({ appointment: a, outcome: "HELD" })}>
                    <Check />
                    {t("outcomes.HELD")}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setClosing({ appointment: a, outcome: "NO_SHOW" })}>
                    <UserX />
                    {t("outcomes.NO_SHOW")}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setClosing({ appointment: a, outcome: "CANCELLED" })}>
                    <X />
                    {t("outcomes.CANCELLED")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => downloadAppointmentIcs({ uid: a.id, title: t("icsTitle", { name: title }), appointment: a, description: a.note ?? undefined })}
                  >
                    <CalendarPlus />
                    {t("addToCalendar")}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Button size="sm" variant="outline" onClick={() => setDialog({ appointment: null })}>
        <CalendarPlus />
        {t("add")}
      </Button>

      {past.length > 0 && (
        <details className="pt-1">
          <summary className="cursor-pointer text-xs text-muted-foreground">{t("past", { count: past.length })}</summary>
          <ul className="mt-1.5 space-y-1">
            {past.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="tabular-nums">{formatAppointmentWhen(a, locale)}</span>
                <ModeBadge mode={a.mode} />
                <span>{t(`outcomes.${a.status as AppointmentOutcome}`)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {dialog && <AppointmentDialog lead={lead} appointment={dialog.appointment} onClose={() => setDialog(null)} />}

      <Dialog open={closing != null} onOpenChange={(o) => !o && !update.isPending && setClosing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{closing ? t(`confirm.${closing.outcome}.title`) : ""}</DialogTitle>
            <DialogDescription>{closing ? t(`confirm.${closing.outcome}.body`) : ""}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClosing(null)} disabled={update.isPending}>
              {t("back")}
            </Button>
            <Button variant={closing?.outcome === "CANCELLED" ? "destructive" : "default"} onClick={close} disabled={update.isPending} aria-busy={update.isPending}>
              {update.isPending && <Loader2 className="animate-spin" />}
              {closing ? t(`outcomes.${closing.outcome}`) : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </LeadSection>
  );
}
