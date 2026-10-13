"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  AlertCircle,
  AlertTriangle,
  AtSign,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  IdCard,
  KeyRound,
  Loader2,
  Mail,
  MoreHorizontal,
  Power,
  ShieldAlert,
  Smartphone,
  UserCheck,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { apiErrorCode } from "@/lib/api/errors";
import { useApiErrorMessage } from "@/lib/hooks/use-api-error-message";
import {
  adminEmailSchema,
  adminPasswordResetSchema,
  leavesNoActiveAdmin,
  type AdminEmailInput,
  type AdminPasswordReset,
  type EdorasLoginKind,
} from "@/lib/domain/institutions/edoras-accounts";
import type { InstitutionAdmin, InstitutionDetail } from "@/lib/domain/institutions/types";
import { useChangeAdminEmail, useResetAdminPassword, useSetAdminActive } from "../admin-accounts";
import { applyServerFieldErrors, TextField } from "./fields";
import { FormDialog } from "./FormDialog";

/**
 * Kurum yöneticileri kartının hesap işlemleri (yalnız ADMIN görür; uçlar da ADMIN ister): giriş e-postası, şifre
 * sıfırlama, aktif / pasif. Edoras'a yazar (lib/server/edoras.ts); her pencere sonucu açıkça yazar. Telefon / TC ile
 * giren hesabın adresi değiştirilemez (girişi kırılır). Süper yöneticiye işlem yok.
 */

const LOGIN_KIND_ICON: Record<EdorasLoginKind, React.ComponentType<{ className?: string }>> = {
  email: AtSign,
  phone: Smartphone,
  tc: IdCard,
};

/** Giriş türü rozeti (E-posta / Telefon / TC); üzerine gelince açıklama. */
export function LoginKindBadge({ kind }: { kind: EdorasLoginKind }) {
  const t = useTranslations("institutions.adminAccounts");
  const Icon = LOGIN_KIND_ICON[kind];
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded border border-border px-1.5 text-[10px] font-semibold text-muted-foreground"
      title={t(`loginKindHint.${kind}`)}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {t(`loginKind.${kind}`)}
    </span>
  );
}

/** Süper yönetici rozeti (CRM'den işlem yapılmaz). */
export function SuperAdminBadge() {
  const t = useTranslations("institutions.adminAccounts");
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded border border-primary/30 px-1.5 text-[10px] font-semibold text-primary"
      title={t("superAdminHint")}
    >
      <ShieldAlert className="h-3 w-3" aria-hidden />
      {t("superAdmin")}
    </span>
  );
}

type DialogKind = "email" | "password" | "active";

/** Satırın "⋯" menüsü + pencereleri. Çağıran yalnız ADMIN için ve süper yönetici olmayan satırda çizer. */
export function AdminAccountMenu({ institution, admin }: { institution: InstitutionDetail; admin: InstitutionAdmin }) {
  const t = useTranslations("institutions.adminAccounts");
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const name = admin.fullName ?? admin.email ?? "—";
  const emailLocked = admin.loginKind !== "email";
  const close = (open: boolean) => (open ? undefined : setDialog(null));

  return (
    <>
      {/* modal={false}: menüden açılan pencere kapanınca sayfa etkileşimsiz kalmasın. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-xs" className="shrink-0" aria-label={t("menuFor", { name })} title={t("menuFor", { name })}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          {emailLocked ? (
            <DropdownMenuItem disabled className="flex-col items-start gap-0.5" title={t(`loginKindHint.${admin.loginKind}`)}>
              <span className="flex items-center gap-2">
                <Mail />
                {t("changeEmail")}
              </span>
              <span className="pl-6 text-[11px] text-muted-foreground">{t("emailLocked")}</span>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => setDialog("email")}>
              <Mail />
              {t("changeEmail")}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => setDialog("password")}>
            <KeyRound />
            {t("resetPassword")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {admin.isActive ? (
            <DropdownMenuItem variant="destructive" onSelect={() => setDialog("active")}>
              <Power />
              {t("deactivate")}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => setDialog("active")}>
              <UserCheck />
              {t("activate")}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {dialog === "email" ? <AdminEmailDialog institution={institution} admin={admin} name={name} onOpenChange={close} /> : null}
      {dialog === "password" ? <AdminPasswordDialog institution={institution} admin={admin} name={name} onOpenChange={close} /> : null}
      {dialog === "active" ? <AdminActiveDialog institution={institution} admin={admin} name={name} onOpenChange={close} /> : null}
    </>
  );
}

interface AccountDialogProps {
  institution: InstitutionDetail;
  admin: InstitutionAdmin;
  name: string;
  onOpenChange: (open: boolean) => void;
}

/** Pencerede "ne olacak" maddeleri + isteğe bağlı uyarı kutusu. */
function Effects({ items, warning }: { items: string[]; warning?: string | null }) {
  return (
    <div className="space-y-2">
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      {warning ? (
        <p className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {warning}
        </p>
      ) : null}
    </div>
  );
}

function AdminEmailDialog({ institution, admin, name, onOpenChange }: AccountDialogProps) {
  const t = useTranslations("institutions.adminAccounts");
  const mutation = useChangeAdminEmail(institution.id);
  const form = useForm<AdminEmailInput>({ resolver: zodResolver(adminEmailSchema), defaultValues: { email: "" } });

  return (
    <FormDialog
      open
      onOpenChange={onOpenChange}
      title={t("email.title")}
      description={t("email.description", { name })}
      form={form}
      submitLabel={t("email.submit")}
      pending={mutation.isPending}
      error={mutation.error}
      onSubmit={(values) =>
        mutation.mutate(
          { userId: admin.userId, input: values },
          {
            onSuccess: (res) => {
              if (res.changed) toast.success(t("email.saved"));
              else toast.info(t("email.unchanged"));
              onOpenChange(false);
            },
            onError: (err) => applyServerFieldErrors(form, err),
          }
        )
      }
    >
      <div className="rounded-xl border border-border bg-muted/40 p-3">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t("email.current")}</p>
        <p className="truncate text-sm font-medium">{admin.email ?? "—"}</p>
      </div>
      <TextField name="email" label={t("email.next")} type="email" placeholder="Ör. ad@kurum.com" autoComplete="off" />
      <Effects
        items={[t("email.effectNow"), t("email.effectPassword"), t("email.effectContact")]}
        warning={admin.otherMembershipCount > 0 ? t("otherMemberships", { count: admin.otherMembershipCount }) : null}
      />
    </FormDialog>
  );
}

function AdminPasswordDialog({ institution, admin, name, onOpenChange }: AccountDialogProps) {
  const t = useTranslations("institutions.adminAccounts");
  const tCommon = useTranslations("common");
  const errorMessage = useApiErrorMessage();
  const mutation = useResetAdminPassword(institution.id);
  const result = mutation.data;
  const pending = mutation.isPending;
  // İsteğe bağlı "şifreyi ben yazayım" (2026-10-13): boş = güçlü geçici şifre üretilir.
  const [customPassword, setCustomPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const submit = () => {
    const parsed = adminPasswordResetSchema.safeParse({ password: customPassword });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? t("password.error"));
      return;
    }
    setFieldError(null);
    mutation.mutate(
      { userId: admin.userId, input: { password: customPassword } },
      { onSuccess: () => setCustomPassword("") }
    );
  };

  return (
    <Dialog open onOpenChange={(next) => (pending ? undefined : onOpenChange(next))}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{result ? t("password.resultTitle") : t("password.title")}</DialogTitle>
          <DialogDescription>{result ? t("password.resultDescription", { name }) : t("password.description", { name })}</DialogDescription>
        </DialogHeader>
        {result ? (
          <PasswordResult result={result} />
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="admin-custom-password">{t("password.custom")}</Label>
              <div className="relative">
                <Input
                  id="admin-custom-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  spellCheck={false}
                  value={customPassword}
                  onChange={(event) => {
                    setCustomPassword(event.target.value);
                    setFieldError(null);
                  }}
                  placeholder={t("password.customPlaceholder")}
                  disabled={pending}
                  aria-invalid={fieldError ? true : undefined}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? t("password.hide") : t("password.show")}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {fieldError ? (
                <p className="text-xs text-destructive">{fieldError}</p>
              ) : (
                <p className="text-xs text-muted-foreground">{t("password.customHint")}</p>
              )}
            </div>
            <Effects
              items={[t("password.effectNow"), t("password.effectOnce"), t("password.effectNoDelivery")]}
              warning={admin.otherMembershipCount > 0 ? t("otherMemberships", { count: admin.otherMembershipCount }) : null}
            />
          </>
        )}
        {mutation.error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{errorMessage(mutation.error, t("password.error"))}</AlertDescription>
          </Alert>
        ) : null}
        <DialogFooter className="gap-2">
          {result ? (
            <Button onClick={() => onOpenChange(false)}>{t("password.close")}</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
                {tCommon("cancel")}
              </Button>
              <Button onClick={submit} disabled={pending} aria-busy={pending}>
                {pending ? <Loader2 className="animate-spin" /> : <KeyRound />}
                {customPassword ? t("password.submitCustom") : t("password.submit")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Yeni giriş bilgisi — CredentialsPanel düzeni (kopyala düğmeleri + "yalnız bir kez" uyarısı). */
function PasswordResult({ result }: { result: AdminPasswordReset }) {
  const t = useTranslations("institutions.adminAccounts.password");
  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t("copied", { label }));
    } catch {
      toast.error(t("copyFailed"));
    }
  };
  const loginLabel = t(`login.${result.loginKind}`);
  const passwordLabel = result.passwordChosen ? t("passwordChosen") : t("password");
  const block = t("copyBlock", { url: result.panelUrl, login: result.loginIdentifier, password: result.temporaryPassword });
  const LoginIcon = LOGIN_KIND_ICON[result.loginKind];
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <CopyItem icon={<LoginIcon className="h-4 w-4" />} label={loginLabel} value={result.loginIdentifier} onCopy={copy} copyLabel={t("copy")} />
        <CopyItem icon={<KeyRound className="h-4 w-4" />} label={passwordLabel} value={result.temporaryPassword} mono onCopy={copy} copyLabel={t("copy")} />
        <CopyItem
          icon={<ExternalLink className="h-4 w-4" />}
          label={t("panel")}
          value={result.panelUrl}
          onCopy={copy}
          copyLabel={t("copy")}
          className="sm:col-span-2"
        />
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
  className,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
  onCopy: (value: string, label: string) => void;
  copyLabel: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start gap-2.5 rounded-xl border border-border bg-muted/40 p-3", className)}>
      <div className="mt-0.5 shrink-0 text-muted-foreground">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="mb-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={cn("truncate text-sm font-medium text-foreground", mono && "font-mono")} title={value}>
          {value}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => onCopy(value, label)}
        aria-label={`${copyLabel}: ${label}`}
        title={copyLabel}
        className="-mr-1 -mt-1 shrink-0 text-muted-foreground"
      >
        <Copy className="size-3.5" />
      </Button>
    </div>
  );
}

function AdminActiveDialog({ institution, admin, name, onOpenChange }: AccountDialogProps) {
  const t = useTranslations("institutions.adminAccounts.active");
  const tCommon = useTranslations("common");
  const errorMessage = useApiErrorMessage();
  const mutation = useSetAdminActive(institution.id);
  const deactivate = admin.isActive;
  const lastAdmin = deactivate && leavesNoActiveAdmin(institution.admins, admin.userId);
  const [confirmed, setConfirmed] = useState(false);
  const pending = mutation.isPending;
  // Sunucu "son aktif yönetici" dediyse (ekrandaki liste eskiyse) onay kutusu yine de gösterilir.
  const serverSaysLast = apiErrorCode(mutation.error) === "EDORAS_LAST_ADMIN";
  const needsConfirm = deactivate && (lastAdmin || serverSaysLast);

  const submit = () =>
    mutation.mutate(
      { userId: admin.userId, input: { active: !deactivate, ...(needsConfirm ? { confirmLastAdmin: confirmed } : {}) } },
      {
        onSuccess: (res) => {
          if (!res.changed) toast.info(t("unchanged"));
          else toast.success(deactivate ? t("deactivated") : t("activated"));
          onOpenChange(false);
        },
      }
    );

  return (
    <Dialog open onOpenChange={(next) => (pending ? undefined : onOpenChange(next))}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{deactivate ? t("deactivateTitle") : t("activateTitle")}</DialogTitle>
          <DialogDescription>{deactivate ? t("deactivateDescription", { name }) : t("activateDescription", { name })}</DialogDescription>
        </DialogHeader>
        {deactivate ? <Effects items={[t("deactivateEffect"), t("deactivateAccess")]} /> : null}
        {needsConfirm ? (
          <div className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3">
            <p className="flex items-start gap-2 text-sm font-medium text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {t("lastAdmin")}
            </p>
            <div className="flex items-center gap-2">
              <Checkbox id={`last-admin-${admin.userId}`} checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} />
              <Label htmlFor={`last-admin-${admin.userId}`}>{t("lastAdminConfirm")}</Label>
            </div>
          </div>
        ) : null}
        {mutation.error && !serverSaysLast ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{errorMessage(mutation.error)}</AlertDescription>
          </Alert>
        ) : null}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {tCommon("cancel")}
          </Button>
          <Button
            variant={deactivate ? "destructive" : "default"}
            onClick={submit}
            disabled={pending || (needsConfirm && !confirmed)}
            aria-busy={pending}
          >
            {pending ? <Loader2 className="animate-spin" /> : deactivate ? <Power /> : <UserCheck />}
            {deactivate ? t("deactivateSubmit") : t("activateSubmit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
