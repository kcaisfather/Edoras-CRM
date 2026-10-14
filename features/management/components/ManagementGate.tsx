"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { KeyRound, Link2Off, Loader2, ShieldAlert, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiErrorMessage } from "@/lib/hooks/use-api-error-message";
import { kcaLinkSchema } from "@/lib/domain/kca/types";
import { useLinkKca, useUnlinkKca } from "../mutations";
import { useKcaSession } from "../queries";
import { Field, KcaSessionProvider, type ReadySession } from "./shared";

function Notice({ icon, title, body, children }: { icon: React.ReactNode; title: string; body: string; children?: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-lg space-y-4 rounded-2xl border border-border bg-card p-6">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 text-primary [&_svg]:size-5">{icon}</div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{body}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

/** KCA Panel e-posta + şifre → bağ (şifre saklanmaz; sunucu KCA Panel'de doğrular). */
function LinkForm({ reason }: { reason: "NONE" | "PASSWORD_CHANGED" | "INACTIVE" }) {
  const t = useTranslations("management.gate");
  const errorMessage = useApiErrorMessage();
  const link = useLinkKca();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (link.isPending) return;
    const parsed = kcaLinkSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? null);
      return;
    }
    setError(null);
    try {
      await link.mutateAsync(parsed.data);
      setPassword("");
      toast.success(t("linked"));
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const body = reason === "PASSWORD_CHANGED" ? t("linkPasswordChanged") : reason === "INACTIVE" ? t("linkInactive") : t("linkBody");
  return (
    <Notice icon={<KeyRound />} title={t("linkTitle")} body={body}>
      <form onSubmit={submit} noValidate className="space-y-3">
        <Field label={t("email")} htmlFor="kca-email">
          <Input id="kca-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} disabled={link.isPending} />
        </Field>
        <Field label={t("password")} htmlFor="kca-password">
          <Input
            id="kca-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={link.isPending}
          />
        </Field>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <p className="text-xs text-muted-foreground">{t("linkPrivacy")}</p>
        <Button type="submit" disabled={link.isPending} aria-busy={link.isPending}>
          {link.isPending && <Loader2 className="animate-spin" />}
          {t("linkSubmit")}
        </Button>
      </form>
    </Notice>
  );
}

function UnlinkButton() {
  const t = useTranslations("management.gate");
  const tc = useTranslations("management.common");
  const errorMessage = useApiErrorMessage();
  const unlink = useUnlinkKca();
  const [open, setOpen] = useState(false);
  const confirm = async () => {
    try {
      await unlink.mutateAsync();
      setOpen(false);
      toast.success(t("unlinked"));
    } catch (err) {
      toast.error(errorMessage(err, tc("error")));
    }
  };
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Link2Off />
        {t("unlink")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("unlinkTitle")}</DialogTitle>
            <DialogDescription>{t("unlinkBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button variant="destructive" onClick={confirm} disabled={unlink.isPending}>
              {unlink.isPending && <Loader2 className="animate-spin" />}
              {t("unlink")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Yönetim sayfalarının kapısı: KCA Panel bağlantısı ayarlı mı, personel KCA hesabını bağlamış mı, Edoras projesi var mı.
 * Hazırsa sayfa başlığı + bağlı hesap şeridi + içerik (oturum bağlamıyla).
 */
export function ManagementGate({ title, description, actions, children }: { title: string; description: string; actions?: React.ReactNode; children: React.ReactNode }) {
  const t = useTranslations("management.gate");
  const errorMessage = useApiErrorMessage();
  const query = useKcaSession();
  const session = query.data;

  let content: React.ReactNode;
  if (query.isLoading) {
    content = <Skeleton className="h-64 w-full rounded-2xl" />;
  } else if (query.isError || !session) {
    content = (
      <div className="space-y-2 rounded-2xl border border-border p-6 text-sm">
        {/* Ör. CONFIG_MISSING: crm_kca_links migration'ı uygulanmamış. */}
        <p className="text-destructive">{errorMessage(query.error, t("error"))}</p>
        <Button size="sm" variant="outline" onClick={() => void query.refetch()}>
          {t("retry")}
        </Button>
      </div>
    );
  } else if (session.state === "NOT_CONFIGURED") {
    content = <Notice icon={<Unplug />} title={t("notConfiguredTitle")} body={t("notConfiguredBody")} />;
  } else if (session.state === "NOT_LINKED") {
    content = <LinkForm reason={session.reason} />;
  } else if (session.state === "NO_SCOPE") {
    content = (
      <Notice icon={<ShieldAlert />} title={t("noScopeTitle")} body={t("noScopeBody")}>
        <UnlinkButton />
      </Notice>
    );
  } else {
    content = children;
  }

  const ready: ReadySession | null = session?.state === "READY" ? session : null;
  // Başlıktaki düğmeler de (Görev aç…) oturum bağlamını kullanır: hazırken bütün sayfa sağlayıcının içinde.
  return (
    <KcaSessionProvider value={ready}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold">{title}</h1>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
          {ready && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
        {ready && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            <span>
              <span className="mr-2 rounded-md bg-primary/10 px-1.5 py-0.5 font-medium text-primary">{t("badge")}</span>
              {t("linkedAs", { name: ready.user.name })} · {t("scopeNote")}
            </span>
            <UnlinkButton />
          </div>
        )}
        {content}
      </div>
    </KcaSessionProvider>
  );
}
