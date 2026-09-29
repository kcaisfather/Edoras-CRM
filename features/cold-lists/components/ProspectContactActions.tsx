"use client";

import { useTranslations } from "next-intl";
import { MessageCircle, Phone } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { toTelLink, toWhatsAppLink } from "@/lib/utils/phone";

/**
 * Soğuk liste kişisine tek tık iletişim (DeepSport growth ContactActions): Ara (tel:) ve WhatsApp (wa.me). Kişi CRM'de
 * olmadığı için deneme notu yazılmaz ve aday şablonları (hoş geldin, demo, yenileme…) gösterilmez. Telefon geçerli
 * bir numaraya çevrilemiyorsa düğme çizilmez.
 */
export function ProspectContactActions({ phone }: { phone: string | null }) {
  const t = useTranslations("growth.actions");
  const tel = toTelLink(phone);
  const wa = toWhatsAppLink(phone);
  const iconLink = buttonVariants({ variant: "ghost", size: "icon-sm" });
  if (!tel && !wa) return null;
  return (
    <div className="flex flex-nowrap items-center gap-0.5">
      {tel && (
        <a href={tel} className={iconLink} title={t("call")} aria-label={t("call")}>
          <Phone />
        </a>
      )}
      {wa && (
        <a href={wa} target="_blank" rel="noopener noreferrer" className={iconLink} title={t("whatsapp")} aria-label={t("whatsapp")}>
          <MessageCircle />
        </a>
      )}
    </div>
  );
}
