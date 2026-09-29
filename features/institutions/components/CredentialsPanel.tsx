"use client";

import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CalendarClock, Copy, ExternalLink, KeyRound, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DemoCredentials } from "@/lib/domain/institutions/types";
import { formatDate } from "../format";

/**
 * Demo açılınca kurum yöneticisinin giriş bilgisi. Şifre yalnız bu ekranda görünür — hiçbir yerde
 * saklanmaz; pencere kapanınca yeniden gösterilemez (gerekirse edoras-admin'den şifre sıfırlanır).
 */
export function CredentialsPanel({ credentials }: { credentials: DemoCredentials }) {
  const t = useTranslations("institutions.credentials");

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t("copied", { label }));
    } catch {
      toast.error(t("copyFailed"));
    }
  };

  const block = t("copyBlock", {
    url: credentials.panelUrl,
    email: credentials.loginEmail,
    password: credentials.temporaryPassword,
    date: formatDate(credentials.demoEndsAt),
  });

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <CopyItem
          icon={<Mail className="h-4 w-4" />}
          label={t("email")}
          value={credentials.loginEmail}
          onCopy={() => copy(credentials.loginEmail, t("email"))}
          copyLabel={t("copy")}
        />
        <CopyItem
          icon={<KeyRound className="h-4 w-4" />}
          label={t("password")}
          value={credentials.temporaryPassword}
          mono
          onCopy={() => copy(credentials.temporaryPassword, t("password"))}
          copyLabel={t("copy")}
        />
        <CopyItem
          icon={<ExternalLink className="h-4 w-4" />}
          label={t("panel")}
          value={credentials.panelUrl}
          onCopy={() => copy(credentials.panelUrl, t("panel"))}
          copyLabel={t("copy")}
        />
        <CopyItem icon={<CalendarClock className="h-4 w-4" />} label={t("demoEndsAt")} value={formatDate(credentials.demoEndsAt)} />
      </div>
      <p className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-xs text-warning">{t("onlyOnce")}</p>
      <Button variant="outline" size="sm" onClick={() => copy(block, t("all"))}>
        <Copy />
        {t("copyAll")}
      </Button>
    </div>
  );
}

function CopyItem({
  icon,
  label,
  value,
  mono,
  onCopy,
  copyLabel,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
  onCopy?: () => void;
  copyLabel?: string;
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-border bg-muted/40 p-3">
      <div className="mt-0.5 shrink-0 text-muted-foreground">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="mb-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={cn("truncate text-sm font-medium text-foreground", mono && "font-mono")}>{value}</p>
      </div>
      {onCopy ? (
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onCopy}
          aria-label={`${copyLabel}: ${label}`}
          title={copyLabel}
          className="-mr-1 -mt-1 shrink-0 text-muted-foreground"
        >
          <Copy className="size-3.5" />
        </Button>
      ) : null}
    </div>
  );
}
