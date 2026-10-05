"use client";

/**
 * Satır içi "Satış aşaması" seçici (DeepSport StatusDropdown): rozet tıklanınca (satır / panel açılmaz) tüm CRM
 * statüleri — şeritle aynı sıra, renk ve etiket; mevcut statü işaretli. Basit statüler hemen kaydedilir ("Geri al"
 * ~5 sn); Teklif verildi (sonraki arama, teklif tutarı ZORUNLU — temsilci de girer) ve Satış olmadı (kayıp nedeni
 * zorunlu, sonraki arama) rozete bağlı küçük bir pencerede ek bilgi ister. Satış oldu satış penceresini açar
 * (LeadSaleDialog: tutar + fatura bilgileri zorunlu, hesap aynı adımda açılır). Yazım: useLeadStatusUpdate (düzenleme
 * formuyla aynı uç ve kurallar; kayıp ayrıntısı, satış tarihi, teklifi veren / satışı yapan sunucuda).
 */
import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { CRM_STATUSES, LOST_REASONS, type CrmLead, type CrmStatus } from "@/lib/domain/crm/types";
import { statusNeedsContext, suggestedNextDate } from "@/lib/domain/crm/status-change";
import { amountToInput, getCrmStatusBadgeClass, getCrmStatusDotClass, getLeadDisplayName } from "@/lib/domain/crm/utils";
import { useCrmRules } from "../queries";
import { useLeadStatusUpdate } from "../useLeadStatusUpdate";
import { AppointmentDialog } from "./AppointmentDialog";
import { LeadSaleDialog } from "./LeadSaleDialog";

/** Satır / kart tıklaması (aday paneli) tetiklenmesin — portal içindeki menü ve pencere olayları da dahil. */
const stop = (e: React.SyntheticEvent) => e.stopPropagation();

const POPOVER_WIDTH = 288;

interface Anchor {
  left: number;
  top?: number;
  bottom?: number;
  width: number;
  /** Ekrana sığmayan içerik pencere içinde kayar. */
  maxHeight: number;
}

function anchorFor(el: HTMLElement | null, height: number): Anchor {
  const width = Math.min(POPOVER_WIDTH, typeof window === "undefined" ? 9999 : window.innerWidth - 16);
  if (typeof window === "undefined" || !el) return { left: 16, top: 80, width, maxHeight: 600 };
  const r = el.getBoundingClientRect();
  const vh = window.innerHeight;
  const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
  const below = vh - r.bottom - 14;
  const above = r.top - 14;
  // Aşağı sığıyorsa ya da aşağıda daha çok yer varsa rozetin altına, aksi hâlde üstüne açılır.
  return below >= height || below >= above
    ? { left, top: r.bottom + 6, width, maxHeight: Math.max(160, below) }
    : { left, bottom: vh - r.top + 6, width, maxHeight: Math.max(160, above) };
}

export function StatusDropdown({
  lead,
  onSold,
  className,
}: {
  lead: CrmLead;
  /** Satış Oldu kaydedilince — devir notu penceresi (ekranı kuran bileşen verir). */
  onSold?: (lead: CrmLead) => void;
  className?: string;
}) {
  const t = useTranslations("crm.statusMenu");
  const tStatus = useTranslations("crm.status");
  const { change, isSaving } = useLeadStatusUpdate();
  const current = lead.status ?? null;
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Menü kapanınca açılacak pencere (menünün odak iadesiyle çakışmasın diye kapanıştan sonra açılır).
  const pendingRef = useRef<CrmStatus | null>(null);
  const [popover, setPopover] = useState<{ target: CrmStatus; anchor: Anchor } | null>(null);
  // "Randevu planlandı": önce randevu penceresi; kaydedilince statü de yazılır (ilk randevuda sunucu zaten geçirir).
  const pendingAppointmentRef = useRef(false);
  const [appointmentOpen, setAppointmentOpen] = useState(false);
  // "Satış oldu": satış penceresi (tutar + fatura bilgileri + hesap).
  const pendingSaleRef = useRef(false);
  const [saleOpen, setSaleOpen] = useState(false);

  const pick = (target: CrmStatus) => {
    if (target === current) return;
    if (target === "RANDEVU_PLANLANDI") {
      pendingAppointmentRef.current = true;
      return;
    }
    if (target === "SATIS_OLDU") {
      pendingSaleRef.current = true;
      return;
    }
    if (statusNeedsContext(target)) {
      pendingRef.current = target;
      return;
    }
    void change(lead, target);
  };

  return (
    <span className={cn("inline-flex", className)} onClick={stop} onKeyDown={stop}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={isSaving}>
          <button
            ref={triggerRef}
            type="button"
            aria-label={t("trigger", { status: current ? tStatus(current) : "—" })}
            title={t("hint")}
            className={cn(
              "inline-flex w-fit cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-shadow",
              "hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-wait",
              getCrmStatusBadgeClass(current)
            )}
          >
            {current ? tStatus(current) : "—"}
            {isSaving ? (
              <Loader2 className="size-3 animate-spin" aria-hidden />
            ) : (
              <ChevronDown className="size-3 opacity-70" aria-hidden />
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="min-w-[200px]"
          onCloseAutoFocus={(e) => {
            if (pendingAppointmentRef.current) {
              pendingAppointmentRef.current = false;
              e.preventDefault();
              setAppointmentOpen(true);
              return;
            }
            if (pendingSaleRef.current) {
              pendingSaleRef.current = false;
              e.preventDefault();
              setSaleOpen(true);
              return;
            }
            const target = pendingRef.current;
            if (!target) return;
            pendingRef.current = null;
            e.preventDefault();
            setPopover({ target, anchor: anchorFor(triggerRef.current, 320) });
          }}
        >
          <DropdownMenuLabel className="text-xs text-muted-foreground">{t("menuLabel")}</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={current ?? ""}>
            {CRM_STATUSES.map((s) => (
              <DropdownMenuRadioItem key={s} value={s} onSelect={() => pick(s)}>
                <span className={cn("size-2 shrink-0 rounded-full", getCrmStatusDotClass(s))} aria-hidden />
                {tStatus(s)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {appointmentOpen && (
        <AppointmentDialog
          lead={lead}
          appointment={null}
          onClose={() => {
            setAppointmentOpen(false);
            triggerRef.current?.focus();
          }}
          onSaved={() => void change(lead, "RANDEVU_PLANLANDI")}
        />
      )}

      {saleOpen && (
        <LeadSaleDialog
          lead={lead}
          onClose={() => {
            setSaleOpen(false);
            triggerRef.current?.focus();
          }}
          onSold={onSold}
        />
      )}

      {popover && (
        <StatusContextPopover
          lead={lead}
          target={popover.target}
          anchor={popover.anchor}
          onClose={() => setPopover(null)}
          onCloseAutoFocus={() => triggerRef.current?.focus()}
          onSold={onSold}
        />
      )}
    </span>
  );
}

/** Teklif verildi / Satış olmadı için rozete bağlı küçük form (Kaydet / Vazgeç). */
function StatusContextPopover({
  lead,
  target,
  anchor,
  onClose,
  onCloseAutoFocus,
  onSold,
}: {
  lead: CrmLead;
  target: CrmStatus;
  anchor: Anchor;
  onClose: () => void;
  onCloseAutoFocus: () => void;
  onSold?: (lead: CrmLead) => void;
}) {
  const t = useTranslations("crm.statusMenu");
  const tStatus = useTranslations("crm.status");
  const tOffer = useTranslations("crm.offer");
  const { change, isSaving } = useLeadStatusUpdate();
  const { rules } = useCrmRules();
  const [nextCall, setNextCall] = useState(() => suggestedNextDate(target, lead.nextFollowUpAt ?? null, rules));
  const [lostReason, setLostReason] = useState<string>(lead.lostReason ?? "");
  const [offerAmount, setOfferAmount] = useState(amountToInput(lead.offerAmount));
  const [error, setError] = useState<{ field: "lostReason" | "offerAmount" | "saleAmount"; message: string } | null>(null);
  const id = `crm-status-${lead.id}`;
  const withDate = target === "TEKLIF_VERILDI" || target === "OLUMSUZ";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    const res = await change(lead, target, { input: { nextCall, lostReason, offerAmount }, onSold });
    if (res.error === "lostReasonRequired") return setError({ field: "lostReason", message: tOffer("lostReasonRequired") });
    if (res.error === "amountInvalid") {
      return setError({ field: target === "TEKLIF_VERILDI" ? "offerAmount" : "saleAmount", message: t("amountInvalid") });
    }
    if (res.error === "offerAmountRequired") return setError({ field: "offerAmount", message: t("offerAmountRequired") });
    if (!res.ok) return;
    onClose();
  };

  return (
    <DialogPrimitive.Root open onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          style={{ position: "fixed", overflowY: "auto", ...anchor }}
          className="z-50 rounded-lg border bg-popover/95 p-3 text-popover-foreground shadow-lg backdrop-blur-md focus:outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            onCloseAutoFocus();
          }}
          onClick={stop}
          onKeyDown={stop}
        >
          <form onSubmit={submit} className="space-y-3" noValidate>
            <div className="space-y-0.5">
              <DialogPrimitive.Title className="flex items-center gap-1.5 text-sm font-semibold">
                <span className={cn("size-2 shrink-0 rounded-full", getCrmStatusDotClass(target))} aria-hidden />
                {tStatus(target)}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="truncate text-xs text-muted-foreground">
                {getLeadDisplayName(lead)}
              </DialogPrimitive.Description>
            </div>

            {target === "OLUMSUZ" && (
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-lostReason`}>{tOffer("lostReason")}</Label>
                <Select
                  value={lostReason}
                  onValueChange={(v) => {
                    setLostReason(v);
                    setError(null);
                  }}
                >
                  <SelectTrigger
                    id={`${id}-lostReason`}
                    className="w-full"
                    aria-invalid={error?.field === "lostReason" ? true : undefined}
                    aria-describedby={error?.field === "lostReason" ? `${id}-lostReason-error` : undefined}
                  >
                    <SelectValue placeholder={tOffer("lostReasonPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {LOST_REASONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {tOffer(`reasons.${r}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {error?.field === "lostReason" && (
                  <p id={`${id}-lostReason-error`} role="alert" className="text-xs text-destructive">
                    {error.message}
                  </p>
                )}
              </div>
            )}

            {withDate && (
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-nextCall`}>{target === "OLUMSUZ" ? t("nextContact") : tOffer("nextCall")}</Label>
                <Input id={`${id}-nextCall`} type="date" value={nextCall} onChange={(e) => setNextCall(e.target.value)} />
                <p className="text-xs text-muted-foreground">{tOffer("nextCallHint")}</p>
              </div>
            )}

            {/* Teklif tutarı zorunlu ve herkese açık (temsilci de girer; listede yine tutar görmez). */}
            {target === "TEKLIF_VERILDI" && (
              <AmountInput
                id={`${id}-offerAmount`}
                label={t("offerAmount")}
                value={offerAmount}
                onChange={(v) => {
                  setOfferAmount(v);
                  setError(null);
                }}
                error={error?.field === "offerAmount" ? error.message : undefined}
              />
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={isSaving}>
                {t("cancel")}
              </Button>
              <Button type="submit" size="sm" disabled={isSaving}>
                {isSaving && <Loader2 className="animate-spin" aria-hidden />}
                {t("save")}
              </Button>
            </div>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function AmountInput({
  id,
  label,
  value,
  onChange,
  error,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        inputMode="decimal"
        placeholder="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
