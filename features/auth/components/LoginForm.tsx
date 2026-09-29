"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslations } from "next-intl";
import { useLogin, type LoginRequest } from "../mutations";
import { apiErrorCode, apiErrorKind } from "@/lib/api/errors";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Mail, Lock, Loader2, LogIn } from "lucide-react";

export function LoginForm() {
  const t = useTranslations("auth.login");
  const loginMutation = useLogin();

  // Create schema with translations
  const loginSchema = z.object({
    email: z.string().min(1, t("email.validation.required")).email(t("email.validation.invalid")),
    password: z.string().min(1, t("password.validation.required")),
  });

  const form = useForm<LoginRequest>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = (data: LoginRequest) => {
    loginMutation.mutate(data);
  };

  const getErrorMessage = () => {
    if (!loginMutation.error) return null;

    // Ham sunucu mesajı gösterilmez; duruma göre çevrilmiş metin.
    if (apiErrorCode(loginMutation.error) === "NOT_STAFF") return t("error.notStaff");
    if (apiErrorCode(loginMutation.error) === "CONFIG_MISSING") return t("error.configMissing");
    switch (apiErrorKind(loginMutation.error)) {
      case "unauthorized":
        return t("error.invalidCredentials");
      case "network":
        return t("error.networkError");
      default:
        return t("error.generic");
    }
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-5"
        noValidate
      >
        {loginMutation.isError && (
          <Alert
            variant="destructive"
            className="animate-in slide-in-from-top-2 fade-in duration-300"
          >
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{getErrorMessage()}</AlertDescription>
          </Alert>
        )}

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem className="space-y-2">
              <FormLabel className="text-sm font-medium">
                {t("email.label")}
              </FormLabel>
              {/* FormControl input'u sarmalı: etiket (htmlFor) ve aria bağlantısı input'a gitsin. */}
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <FormControl>
                  <Input
                    {...field}
                    type="email"
                    placeholder={t("email.placeholder")}
                    autoComplete="email"
                    disabled={loginMutation.isPending}
                    className="pl-10"
                  />
                </FormControl>
              </div>
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem className="space-y-2">
              <FormLabel className="text-sm font-medium">
                {t("password.label")}
              </FormLabel>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <FormControl>
                  <Input
                    {...field}
                    type="password"
                    placeholder={t("password.placeholder")}
                    autoComplete="current-password"
                    disabled={loginMutation.isPending}
                    className="pl-10"
                  />
                </FormControl>
              </div>
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />

        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={loginMutation.isPending}
          aria-busy={loginMutation.isPending}
        >
          {loginMutation.isPending ? (
            <>
              <Loader2 className="animate-spin" />
              {t("submitting")}
            </>
          ) : (
            <>
              <LogIn />
              {t("submit")}
            </>
          )}
        </Button>
      </form>
    </Form>
  );
}

