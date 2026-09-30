"use client";

/**
 * Kampanya (DeepSport Madde 15): segment + şablon + kanal.
 *  - WhatsApp: kişi başı hazır mesajlı wa.me bağlantısı (gönderimi kullanıcı yapar; hiçbir şey otomatik gitmez).
 *  - CSV: alıcı listesi + kişiselleştirilmiş mesaj.
 * E-posta kanalı yok (toplu pazarlama e-postası için onay/çıkış kaydı ve gönderim geçmişi CRM'de yok).
 */
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Copy, Download, MessageCircle } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { CoverageNote } from "@/components/ui/coverage-note";
import { cn } from "@/lib/utils";
import { downloadCsv } from "@/lib/utils/csv";
import { toWhatsAppLink } from "@/lib/utils/phone";
import {
  CAMPAIGN_CHANNELS,
  CAMPAIGN_SEGMENTS,
  CAMPAIGN_TEMPLATES,
  inSegment,
  renderTemplate,
  type CampaignCandidate,
  type CampaignChannel,
  type CampaignSegment,
  type CampaignTemplate,
} from "@/lib/domain/growth/campaign";

export function CampaignDialog({
  open,
  onOpenChange,
  candidates,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidates: CampaignCandidate[];
}) {
  const t = useTranslations("growth.campaign");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        {open && <CampaignForm candidates={candidates} />}
      </DialogContent>
    </Dialog>
  );
}

function CampaignForm({ candidates }: { candidates: CampaignCandidate[] }) {
  const t = useTranslations("growth.campaign");
  const [segment, setSegment] = useState<CampaignSegment>("all");
  const [template, setTemplate] = useState<CampaignTemplate>("thanks");
  // Şablon metinleri {name}/{organization} yer tutucusu içerir: ICU biçimlemesi olmadan ham okunur.
  const [text, setText] = useState(() => String(t.raw("templates.thanks.text")));
  const [channel, setChannel] = useState<CampaignChannel>("whatsapp");
  const [opened, setOpened] = useState<Set<string>>(new Set());

  const counts = useMemo(
    () => Object.fromEntries(CAMPAIGN_SEGMENTS.map((s) => [s, candidates.filter((c) => inSegment(c, s)).length])) as Record<CampaignSegment, number>,
    [candidates]
  );
  const recipients = useMemo(() => candidates.filter((c) => inSegment(c, segment)), [candidates, segment]);
  const withPhone = recipients.filter((c) => toWhatsAppLink(c.phone));

  const pickTemplate = (tpl: CampaignTemplate) => {
    setTemplate(tpl);
    setText(String(t.raw(`templates.${tpl}.text`)));
  };

  const copyLinks = async () => {
    const lines = withPhone.map((c) => `${c.name} — ${toWhatsAppLink(c.phone, renderTemplate(text, c))}`);
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      toast.success(t("copied", { count: lines.length }));
    } catch {
      toast.error(t("copyError"));
    }
  };

  const downloadRecipients = () =>
    downloadCsv(
      `kampanya-${segment}-${template}`,
      [t("csv.name"), t("csv.contact"), t("csv.phone"), t("csv.email"), t("csv.message"), t("csv.whatsapp")],
      recipients.map((c) => {
        const msg = renderTemplate(text, c);
        return [c.name, c.contactName, c.phone, c.email, msg, toWhatsAppLink(c.phone, msg) ?? ""];
      })
    );

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>{t("segment")}</Label>
        <SegmentedControl<CampaignSegment>
          value={segment}
          onValueChange={setSegment}
          aria-label={t("segment")}
          options={CAMPAIGN_SEGMENTS.map((s) => ({ value: s, label: `${t(`segments.${s}`)} ${counts[s]}` }))}
        />
      </div>

      <div className="space-y-1.5">
        <Label>{t("template")}</Label>
        <SegmentedControl<CampaignTemplate>
          value={template}
          onValueChange={pickTemplate}
          aria-label={t("template")}
          options={CAMPAIGN_TEMPLATES.map((k) => ({ value: k, label: t(`templates.${k}.label`) }))}
        />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          aria-label={t("message")}
          className="w-full rounded-lg border border-input bg-background p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        />
        <p className="text-xs text-muted-foreground">{t("placeholders")}</p>
      </div>

      <div className="space-y-1.5">
        <Label>{t("channel")}</Label>
        <SegmentedControl<CampaignChannel>
          value={channel}
          onValueChange={setChannel}
          aria-label={t("channel")}
          options={CAMPAIGN_CHANNELS.map((k) => ({ value: k, label: t(`channels.${k}`) }))}
        />
      </div>

      {channel === "whatsapp" ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">{t("whatsappSummary", { withPhone: withPhone.length, total: recipients.length })}</p>
            <Button size="sm" variant="outline" onClick={copyLinks} disabled={withPhone.length === 0}>
              <Copy />
              {t("copy")}
            </Button>
          </div>
          <ul className="max-h-56 divide-y divide-border/60 overflow-y-auto rounded-xl border border-border/60">
            {recipients.map((c) => {
              const link = toWhatsAppLink(c.phone, renderTemplate(text, c));
              const done = opened.has(c.id);
              return (
                <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{c.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{c.contactName || "—"}</span>
                  </span>
                  {link ? (
                    <a
                      href={link}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => setOpened((prev) => new Set(prev).add(c.id))}
                      className={cn(buttonVariants({ variant: done ? "outline" : "default", size: "sm" }))}
                    >
                      <MessageCircle />
                      {done ? t("opened") : t("open")}
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground">{t("noPhone")}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">{t("csvSummary", { total: recipients.length })}</p>
          <Button size="sm" onClick={downloadRecipients} disabled={recipients.length === 0}>
            <Download />
            {t("download")}
          </Button>
        </div>
      )}
      <CoverageNote>{t("note")}</CoverageNote>
    </div>
  );
}
