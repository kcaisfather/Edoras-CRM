"use client";

import { useTranslations } from "next-intl";
import { Mail, MessageCircle, Phone, PhoneOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { normalizeEmail, toTelLink, toWhatsAppLink } from "@/lib/utils/phone";
import { formatPhone } from "@/features/institutions";
import { useCreateCrmNote } from "@/features/crm-notes";
import { buildNoteContent } from "@/lib/domain/crm-notes/utils";
import { leadBalance } from "@/lib/domain/crm/signals";
import type { CrmLead } from "@/lib/domain/crm/types";
import { formatCrmDate, formatCurrency } from "@/lib/domain/crm/utils";

/** WhatsApp şablonları (Edoras'a uyarlandı: DeepSport'un ek süre ve kontenjan şablonları yok). */
export const CONTACT_TEMPLATES = [
  "welcome",
  "demoWelcome",
  "demoEnding",
  "demoEnded",
  "renewal",
  "payment",
  "balanceReminder",
] as const;
export type ContactTemplate = (typeof CONTACT_TEMPLATES)[number];

export interface ContactTarget {
  /** Denemenin not olarak yazılacağı aday; adayı olmayan kurumda (Yeni kayıtlar) null → not yazılmaz. */
  leadId: string | null;
  phone?: string | null;
  email?: string | null;
  name?: string | null;
  organization?: string | null;
  /** Demo ya da lisans bitişi (biçimli). */
  endDate?: string | null;
  /** Kalan bakiye (biçimli) — "Bakiye hatırlatma" şablonu; yoksa şablon gizlenir. */
  remainingBalance?: string | null;
}

/**
 * Aday → iletişim şablonu değişkenleri (G20). Bitiş: bağlı kurum demodaysa demo bitişi, değilse lisans
 * bitişi. `withBalance` yalnız finans yetkisiyle verilir (şablon kalan tutarı içerir).
 */
export function contactTargetFor(lead: CrmLead, displayName: string, withBalance = false): ContactTarget {
  const inst = lead.institution;
  const end = inst?.crm?.status === "DEMO" ? inst.crm.demoEndsAt : (inst?.licenseEndsOn ?? null);
  const balance = leadBalance(lead);
  return {
    leadId: lead.id,
    phone: lead.contactPhone,
    email: lead.contactEmail,
    name: lead.contactFirstName || displayName,
    organization: lead.organizationName ?? inst?.name ?? null,
    endDate: end ? formatCrmDate(end) : null,
    remainingBalance: withBalance && balance > 0 ? formatCurrency(balance) : null,
  };
}

/**
 * Tek tık iletişim (G20): Ara (tel:), E-posta (mailto:), WhatsApp şablonları (wa.me). Bağlantılar gönderimi
 * doğrulayamaz; tıklamada adaya yalnızca "iletişim denemesi" notu (ILETISIM) düşer.
 */
export function CrmContactMenu({
  target,
  templates = CONTACT_TEMPLATES,
}: {
  target: ContactTarget;
  templates?: readonly ContactTemplate[];
}) {
  const t = useTranslations("crm.contact");
  const tTpl = useTranslations("crm.templates");
  const createNote = useCreateCrmNote();

  const tel = toTelLink(target.phone);
  const email = normalizeEmail(target.email);
  const phoneInvalid = !!target.phone?.trim() && !tel;

  const logAttempt = (channel: string, template?: string) => {
    if (!target.leadId) return;
    createNote.mutate({
      leadId: target.leadId,
      content: buildNoteContent("ILETISIM", template ? [channel, template] : [channel], t("attemptNote")),
    });
  };

  const templateText = (tpl: ContactTemplate) =>
    tTpl(`${tpl}.text`, {
      ad: target.name?.trim() || "",
      kurum: target.organization?.trim() || "",
      bitisTarihi: target.endDate || "",
      kalanBakiye: target.remainingBalance ?? "",
    });
  // Bakiye şablonu yalnız kalan bakiye biliniyorsa (tutar görmeyen CRM_AGENT'a hiç verilmez).
  const shownTemplates = templates.filter((tpl) => tpl !== "balanceReminder" || !!target.remainingBalance);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={t("label")} title={phoneInvalid ? t("phoneInvalid") : t("label")}>
          {phoneInvalid ? <PhoneOff className="text-warning" /> : <Phone />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {phoneInvalid && (
          <DropdownMenuLabel className="text-xs font-normal text-warning">
            {t("phoneInvalid")}: {target.phone}
          </DropdownMenuLabel>
        )}
        {/* Gerçek bağlantılar (tel:/mailto:): işletim sistemi uygulamayı açar, orta tık ve kopyalama çalışır. */}
        {tel ? (
          <DropdownMenuItem asChild onSelect={() => logAttempt("telefon")}>
            <a href={tel}>
              <Phone />
              {t("call")} · {formatPhone(target.phone)}
            </a>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem disabled>
            <Phone />
            {t("call")}
          </DropdownMenuItem>
        )}
        {email ? (
          <DropdownMenuItem asChild onSelect={() => logAttempt("eposta")}>
            <a href={`mailto:${email}`}>
              <Mail />
              {t("email")}
            </a>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem disabled>
            <Mail />
            {t("email")}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{t("whatsapp")}</DropdownMenuLabel>
        {shownTemplates.map((tpl) => (
          <DropdownMenuItem
            key={tpl}
            disabled={!tel}
            onSelect={() => {
              const link = toWhatsAppLink(target.phone, templateText(tpl));
              if (!link) return;
              logAttempt("whatsapp", tpl);
              window.open(link, "_blank", "noopener,noreferrer");
            }}
          >
            <MessageCircle />
            {tTpl(`${tpl}.label`)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
