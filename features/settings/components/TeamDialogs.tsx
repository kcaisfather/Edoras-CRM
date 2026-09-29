"use client";

import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PanelRole } from "@/lib/domain/auth/types";
import { useApiErrorMessage } from "@/lib/hooks/use-api-error-message";
import { PANEL_ROLES, validateInvite, type InviteInput, type StaffMember } from "@/lib/domain/staff/logic";
import { useInviteStaff } from "../team/mutations";

const EMPTY_INVITE: InviteInput = { email: "", firstName: "", lastName: "", panelRole: "CRM_AGENT" };

/** CRM kullanıcısı ekle. Yeni hesapta geçici şifre `onCreated` ile bir kez gösterilir. */
export function InviteDialog({
  open,
  onOpenChange,
  existing,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing: StaffMember[];
  onCreated: (email: string, password: string | null) => void;
}) {
  const t = useTranslations("settingsx.team");
  const errorMessage = useApiErrorMessage();
  const inviteMut = useInviteStaff();

  // Kurallar lib/domain/staff/logic.ts'teki validateInvite'tan gelir (testli); zod alanlara eşler ve çevirir.
  const schema = useMemo(
    () =>
      z
        .object({
          email: z.string(),
          firstName: z.string(),
          lastName: z.string(),
          panelRole: z.enum(["ADMIN", "CRM_AGENT"]),
        })
        .superRefine((v, ctx) => {
          for (const e of validateInvite(v, existing)) {
            ctx.addIssue({
              code: "custom",
              path: [e === "nameRequired" ? "firstName" : "email"],
              message: t(`inviteErrors.${e}`),
            });
          }
        }),
    [existing, t]
  );

  const form = useForm<InviteInput>({ resolver: zodResolver(schema), defaultValues: EMPTY_INVITE });

  const close = (o: boolean) => {
    if (inviteMut.isPending) return;
    onOpenChange(o);
    if (!o) form.reset(EMPTY_INVITE);
  };

  const submit = async (values: InviteInput) => {
    try {
      const res = await inviteMut.mutateAsync(values);
      close(false);
      onCreated(res.member.email, res.temporaryPassword);
    } catch (err) {
      toast.error(errorMessage(err, t("inviteError")));
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("inviteTitle")}</DialogTitle>
          <DialogDescription>{t("inviteDescription")}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form id="invite-form" onSubmit={form.handleSubmit(submit)} className="space-y-3" noValidate>
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem className="space-y-1.5">
                  <FormLabel>{t("fields.email")}</FormLabel>
                  <FormControl>
                    <Input type="email" autoComplete="off" {...field} />
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem className="space-y-1.5">
                    <FormLabel>{t("fields.firstName")}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem className="space-y-1.5">
                    <FormLabel>{t("fields.lastName")}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="panelRole"
              render={({ field }) => (
                <FormItem className="space-y-1.5">
                  <FormLabel>{t("fields.role")}</FormLabel>
                  <Select value={field.value} onValueChange={(v) => field.onChange(v as PanelRole)}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {PANEL_ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {t(`roles.${r}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{t(`roleHelp.${field.value}`)}</p>
                </FormItem>
              )}
            />
            <p className="rounded-lg bg-muted/60 p-2 text-xs text-muted-foreground">{t("inviteEffect")}</p>
          </form>
        </Form>
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)} disabled={inviteMut.isPending}>
            {t("cancel")}
          </Button>
          <Button type="submit" form="invite-form" disabled={inviteMut.isPending} aria-busy={inviteMut.isPending}>
            {inviteMut.isPending && <Loader2 className="animate-spin" />}
            {t("sendInvite")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Geçici şifre (bir kez). Şifre yoksa kullanıcı bu projede zaten vardı; mevcut şifresiyle girer. */
export function CredentialsDialog({
  credentials,
  onClose,
}: {
  credentials: { email: string; password: string | null } | null;
  onClose: () => void;
}) {
  const t = useTranslations("settingsx.team");
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t("copied"));
    } catch {
      /* pano kapalı olabilir; şifre ekranda */
    }
  };
  return (
    <Dialog open={credentials != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("credentialsTitle")}</DialogTitle>
          <DialogDescription>
            {credentials?.password
              ? t("credentialsBody", { email: credentials.email })
              : t("credentialsExisting", { email: credentials?.email ?? "" })}
          </DialogDescription>
        </DialogHeader>
        {credentials?.password ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 p-3">
            <span className="font-mono text-sm">{credentials.password}</span>
            <Button variant="outline" size="sm" onClick={() => copy(credentials.password as string)}>
              <Copy />
              {t("copyPassword")}
            </Button>
          </div>
        ) : null}
        <DialogFooter>
          <Button onClick={onClose}>{t("done")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
