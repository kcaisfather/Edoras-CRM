"use client";

import { useTranslations } from "next-intl";
import { Mail, MessageCircle, Phone } from "lucide-react";
import { Link } from "@/lib/navigation";
import { InstitutionInfoBadge, formatDate, programLabel } from "@/features/institutions";
import { cn } from "@/lib/utils";
import { todayIso } from "@/lib/domain/institutions/rules";
import { customerStatusInfo } from "@/lib/domain/growth/status";
import { daysSinceActivity, isUsing, USING_DAYS } from "@/lib/domain/growth/usage";
import type { GrowthCustomer } from "@/lib/domain/growth/types";
import { inactivityTone, type InactivityTone } from "@/lib/utils/customer-signals";
import { toTelLink, toWhatsAppLink } from "@/lib/utils/phone";

export const TH = "text-xs font-semibold uppercase tracking-wider text-muted-foreground";
export const CLICKABLE_ROW =
  "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60";
export const TABLE = "min-w-max [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap [&_thead_tr]:bg-muted/40";

const TONE_DOT: Record<InactivityTone, string> = {
  green: "bg-success",
  yellow: "bg-caution",
  orange: "bg-warning",
  red: "bg-destructive",
  gray: "bg-muted-foreground/40",
};

/** Kurum adı (ayrıntıya bağlantı) + program etiketi. */
export function CustomerCell({ customer }: { customer: GrowthCustomer }) {
  return (
    <span className="flex min-w-0 flex-col leading-tight">
      {/* Satır zaten tıklanınca ayrıntıya gider; bağlantı olayı yutar (çift gezinme / çift geçmiş kaydı olmasın). */}
      <Link
        href={`/institutions/${customer.id}`}
        onClick={(e) => e.stopPropagation()}
        className="flex items-center gap-2 font-medium hover:text-primary hover:underline"
      >
        {customer.name}
        {customer.program ? (
          <span className="rounded border border-border px-1.5 text-[10px] font-semibold text-muted-foreground">{programLabel(customer.program)}</span>
        ) : null}
      </Link>
      {customer.contactName ? <span className="text-xs text-muted-foreground">{customer.contactName}</span> : null}
    </span>
  );
}

export function CustomerStatusBadge({ customer, today }: { customer: GrowthCustomer; today?: string }) {
  return <InstitutionInfoBadge info={customerStatusInfo(customer, today ?? todayIso())} />;
}

/** "bugün", "3 gün önce" + renk noktası; hiç etkinlik yoksa "Hiç". Kullanım hesaplanamadıysa "—". */
export function LastActivity({ customer }: { customer: GrowthCustomer }) {
  const t = useTranslations("growth.common");
  if (!customer.usage) return <span className="text-muted-foreground">—</span>;
  const days = daysSinceActivity(customer.usage);
  const label = days == null ? t("never") : days <= 0 ? t("today") : t("daysAgo", { days });
  return (
    <span className="inline-flex items-center gap-1.5 text-sm" title={customer.usage.lastActivityOn ? formatDate(customer.usage.lastActivityOn) : undefined}>
      <span aria-hidden className={cn("h-2 w-2 rounded-full", TONE_DOT[inactivityTone(days)])} />
      {label}
    </span>
  );
}

/** Kullanıyor / Kullanmıyor rozeti (son 14 gün). */
export function UsageBadge({ customer }: { customer: GrowthCustomer }) {
  const t = useTranslations("growth.common");
  if (!customer.usage) return <span className="text-muted-foreground">—</span>;
  const using = isUsing(customer.usage);
  return (
    <span
      title={t("usingHint", { days: USING_DAYS })}
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold",
        using ? "border-success/25 bg-success/10 text-success" : "border-border bg-muted text-muted-foreground"
      )}
    >
      {using ? t("using") : t("notUsing")}
    </span>
  );
}

/** Yetkili kişiye WhatsApp / ara / e-posta kısayolları (CRM'deki iletişim bilgisi). */
export function ContactActions({ customer }: { customer: Pick<GrowthCustomer, "contactPhone" | "contactEmail" | "name"> }) {
  const t = useTranslations("growth.common");
  const whatsapp = toWhatsAppLink(customer.contactPhone);
  const tel = toTelLink(customer.contactPhone);
  const mail = customer.contactEmail ? `mailto:${customer.contactEmail}` : null;
  if (!whatsapp && !tel && !mail) return <span className="text-muted-foreground">—</span>;
  const cls = "inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground";
  return (
    <span className="inline-flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
      {whatsapp ? (
        <a href={whatsapp} target="_blank" rel="noreferrer" className={cls} aria-label={t("whatsapp", { name: customer.name })}>
          <MessageCircle className="h-4 w-4" />
        </a>
      ) : null}
      {tel ? (
        <a href={tel} className={cls} aria-label={t("call", { name: customer.name })}>
          <Phone className="h-4 w-4" />
        </a>
      ) : null}
      {mail ? (
        <a href={mail} className={cls} aria-label={t("mail", { name: customer.name })}>
          <Mail className="h-4 w-4" />
        </a>
      ) : null}
    </span>
  );
}

/** Kart: başlık + değer (+ ipucu altı). Tıklanabilir sürüm için `onClick`. */
export function StatCard({
  label,
  value,
  hint,
  active,
  onClick,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  tone?: string;
}) {
  const body = (
    <>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-lg font-semibold leading-tight tabular-nums", tone)}>{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p> : null}
    </>
  );
  const base = "glass-panel rounded-2xl px-4 py-3 text-left";
  if (!onClick) return <div className={base}>{body}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(base, "cursor-pointer transition-colors hover:bg-accent/40", active && "ring-2 ring-primary/40")}
    >
      {body}
    </button>
  );
}

export function formatNumber(n: number | null | undefined): string {
  return n == null ? "—" : n.toLocaleString("tr-TR");
}
