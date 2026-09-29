"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, Copy, Loader2, MessageCircle, MessageSquareText } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { useApiErrorMessage } from "@/lib/hooks/use-api-error-message";
import { buildSurveyReminder } from "@/lib/domain/surveys/message";
import type { CreatedSurveyInvitation, SurveyChannel, SurveyRecipientInput } from "@/lib/domain/surveys/types";
import { useMarkInvitationSent } from "../mutations";
import { appOrigin } from "../recipients";
import { copyText } from "./parts";

export interface SendResultRow {
  recipient: SurveyRecipientInput;
  invitation: CreatedSurveyInvitation;
}

/**
 * Gönderim sonucu (DeepSport SendSurveyDialog sonuç listesi). WhatsApp / SMS / Link: her satırda uygulamayı aç ya da
 * kopyala, sonra "Gönderdim" (CREATED → SENT; anket araması bu andan sayılır). E-posta: yalnız mevcut davet dönen
 * (e-postası tekrar gitmeyen) kişiler listelenir.
 */
export function SendSurveyResults({ rows, channel }: { rows: SendResultRow[]; channel: SurveyChannel }) {
  const t = useTranslations("surveys.send");
  const shown = channel === "EMAIL" ? rows.filter((r) => r.invitation.reused) : rows;
  if (shown.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">{t(`afterHint.${channel}`)}</p>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {shown.map((row) => (
          <ResultRow key={row.invitation.id} row={row} channel={channel} />
        ))}
      </ul>
    </div>
  );
}

function ResultRow({ row: { recipient, invitation }, channel }: { row: SendResultRow; channel: SurveyChannel }) {
  const t = useTranslations("surveys.send");
  const errorMessage = useApiErrorMessage();
  const markSent = useMarkInvitationSent();
  const [sent, setSent] = useState(invitation.status !== "CREATED");
  const [touched, setTouched] = useState(false);
  const r = buildSurveyReminder({ origin: appOrigin(), token: invitation.token, name: recipient.name, phone: recipient.phone, kind: "invite" });
  const link = buttonVariants({ variant: "outline", size: "sm" });
  // Personel "gönderdim" diyebilir yalnız link kanallarında ve henüz gönderilmemiş davette (e-postayı sunucu işaretler).
  const canMark = invitation.channel !== "EMAIL" && !sent;

  const confirmSent = () =>
    markSent.mutate(invitation.id, {
      onSuccess: () => {
        setSent(true);
        toast.success(t("markedSent"));
      },
      onError: (err) => toast.error(errorMessage(err)),
    });

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 truncate text-sm font-medium">
          {recipient.organizationName || recipient.name}
          {invitation.reused && <span className="shrink-0 rounded border border-border px-1 text-[10px] font-normal text-muted-foreground">{t("reusedTag")}</span>}
        </p>
        <p className="truncate text-xs text-muted-foreground">{recipient.phone || r.link}</p>
      </div>
      <div className="flex flex-wrap gap-1.5" onClickCapture={() => setTouched(true)}>
        {channel === "WHATSAPP" && r.whatsappUrl && (
          <a href={r.whatsappUrl} target="_blank" rel="noopener noreferrer" className={link}>
            <MessageCircle />
            {t("openWhatsapp")}
          </a>
        )}
        {channel === "SMS" && r.smsUrl && (
          <a href={r.smsUrl} className={link}>
            <MessageSquareText />
            {t("openSms")}
          </a>
        )}
        <Button size="sm" variant="ghost" onClick={() => copyText(r.message, t("copied"), t("copyFailed"))}>
          <Copy />
          {t("copyMessage")}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => copyText(r.link, t("copied"), t("copyFailed"))}>
          <Copy />
          {t("copyLink")}
        </Button>
        {canMark ? (
          <Button size="sm" variant={touched ? "default" : "outline"} onClick={confirmSent} disabled={markSent.isPending} aria-busy={markSent.isPending}>
            {markSent.isPending ? <Loader2 className="animate-spin" /> : <Check />}
            {t("markSent")}
          </Button>
        ) : (
          invitation.channel !== "EMAIL" &&
          sent && (
            <span className="inline-flex items-center gap-1 px-2 text-xs text-success">
              <Check className="h-3.5 w-3.5" />
              {t("markedSent")}
            </span>
          )
        )}
      </div>
    </li>
  );
}
