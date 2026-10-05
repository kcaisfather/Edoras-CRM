"use client";

/**
 * Randevu penceresi (yeni randevu ya da düzenleme) ve formu. Aday panelindeki "Randevular" bölümü ve satır içi statü
 * seçici ("Randevu planlandı") aynı pencereyi kullanır. Doğrulama: lib/domain/crm/appointment.ts (validateAppointmentDraft);
 * sunucu ve veritabanı aynı kuralları ayrıca uygular.
 */
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, MapPin, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidePanel, SidePanelContent, SidePanelDescription, SidePanelFooter, SidePanelHeader, SidePanelTitle } from "@/components/ui/side-panel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useApiErrorMessage } from "@/lib/hooks/use-api-error-message";
import type { CrmLead } from "@/lib/domain/crm/types";
import { getLeadDisplayName } from "@/lib/domain/crm/utils";
import {
  appointmentTimes,
  defaultAppointmentDraft,
  draftFromAppointment,
  draftToAppointment,
  validateAppointmentDraft,
  type AppointmentDraft,
  type AppointmentDraftError,
  type AppointmentDto,
  type AppointmentMode,
} from "@/lib/domain/crm/appointment";
import { useCreateAppointment, useUpdateAppointment } from "../appointments";

const TIMES = appointmentTimes();
const TEXTAREA_CLASS =
  "flex min-h-[56px] w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 md:text-sm";

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
export function AppointmentDialog({
  lead,
  appointment,
  onClose,
  onSaved,
}: {
  lead: CrmLead;
  appointment: AppointmentDto | null;
  onClose: () => void;
  /** Kaydedildikten sonra (pencere kapanmadan önce). */
  onSaved?: () => void;
}) {
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
      onSaved?.();
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, t("saveError")));
    }
  };

  return (
    <SidePanel open onOpenChange={(o) => !o && !pending && onClose()}>
      <SidePanelContent size="md">
        <SidePanelHeader>
          <SidePanelTitle>{t(appointment ? "editTitle" : "addTitle")}</SidePanelTitle>
          <SidePanelDescription>{getLeadDisplayName(lead)}</SidePanelDescription>
        </SidePanelHeader>
        <AppointmentForm idPrefix="appt" value={draft} onChange={setDraft} error={error} disabled={pending} />
        <SidePanelFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            {tCommon("cancel")}
          </Button>
          <Button onClick={save} disabled={pending} aria-busy={pending}>
            {pending && <Loader2 className="animate-spin" />}
            {t(appointment ? "reschedule" : "add")}
          </Button>
        </SidePanelFooter>
      </SidePanelContent>
    </SidePanel>
  );
}

