"use client";

import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { KeyRound, Loader2, LogOut, Palette, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { ModeToggle } from "@/components/mode-toggle";
import { useChangePassword, useCurrentUser, useLogout } from "@/features/auth";
import { apiErrorKind } from "@/lib/api/errors";

const MIN_PASSWORD = 8;

/** Ayarlar → Genel: hesap bilgisi, tema, şifre değiştirme ve çıkış. */
export function AccountPanel() {
  const t = useTranslations("settings");
  const tNav = useTranslations("navigation");
  const { data: user } = useCurrentUser();
  const logout = useLogout();

  return (
    <div className="max-w-2xl space-y-6">

      <Card className="glass-panel rounded-2xl border-border/50 p-6">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
          <UserRound className="h-5 w-5 text-primary" />
          {t("account")}
        </h2>
        <dl className="grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t("name")}</dt>
            <dd className="text-sm">{user?.fullName ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t("email")}</dt>
            <dd className="break-all text-sm">{user?.email ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t("role")}</dt>
            <dd className="text-sm">{user ? t(`roles.${user.role}`) : "—"}</dd>
          </div>
        </dl>
      </Card>

      {user?.email ? <ChangePasswordCard email={user.email} /> : null}

      <Card className="glass-panel rounded-2xl border-border/50 p-6">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
          <Palette className="h-5 w-5 text-primary" />
          {t("appearance")}
        </h2>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">{t("theme")}</span>
          <ModeToggle />
        </div>
        <div className="mt-6 border-t border-border pt-4">
          <Button variant="outline" onClick={() => logout.mutate()} disabled={logout.isPending} aria-busy={logout.isPending}>
            {logout.isPending ? <Loader2 className="animate-spin" /> : <LogOut />}
            {tNav("logout")}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function ChangePasswordCard({ email }: { email: string }) {
  const t = useTranslations("settings.password");
  const change = useChangePassword();
  const schema = z
    .object({
      oldPassword: z.string().min(1, t("required")),
      newPassword: z.string().min(MIN_PASSWORD, t("tooShort", { count: MIN_PASSWORD })),
      confirm: z.string(),
    })
    .refine((v) => v.newPassword === v.confirm, { path: ["confirm"], message: t("mismatch") });
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { oldPassword: "", newPassword: "", confirm: "" } });

  const submit = (values: Values) =>
    change.mutate(
      { email, oldPassword: values.oldPassword, newPassword: values.newPassword },
      {
        onSuccess: () => {
          toast.success(t("saved"));
          form.reset();
        },
        onError: (err) => {
          if (apiErrorKind(err) === "unauthorized") form.setError("oldPassword", { message: t("wrongOld") });
          else toast.error(t("failed"));
        },
      }
    );

  const fields: { name: keyof Values; label: string; autoComplete: string }[] = [
    { name: "oldPassword", label: t("old"), autoComplete: "current-password" },
    { name: "newPassword", label: t("new"), autoComplete: "new-password" },
    { name: "confirm", label: t("confirm"), autoComplete: "new-password" },
  ];

  return (
    <Card className="glass-panel rounded-2xl border-border/50 p-6">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
        <KeyRound className="h-5 w-5 text-primary" />
        {t("title")}
      </h2>
      <Form {...form}>
        <form className="space-y-4" noValidate onSubmit={form.handleSubmit(submit)}>
          {fields.map((f) => (
            <FormField
              key={f.name}
              control={form.control}
              name={f.name}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{f.label}</FormLabel>
                  <FormControl>
                    <Input {...field} type="password" autoComplete={f.autoComplete} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ))}
          <Button type="submit" disabled={change.isPending} aria-busy={change.isPending}>
            {change.isPending ? <Loader2 className="animate-spin" /> : null}
            {t("submit")}
          </Button>
        </form>
      </Form>
    </Card>
  );
}
