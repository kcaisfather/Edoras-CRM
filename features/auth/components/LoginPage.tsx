"use client";

import { useTranslations } from "next-intl";
import { LoginForm } from "./LoginForm";
import { LoginRedirect } from "./LoginRedirect";
import { ModeToggle } from "@/components/mode-toggle";
import { LoginLogo } from "@/features/auth/components/LoginLogo";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function LoginPage() {
  const t = useTranslations("auth.login");
  const tApp = useTranslations("app");

  return (
    <>
      <LoginRedirect />
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
        {/* Background gradient with animation */}
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-background via-background to-muted/20" />
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />

        {/* Animated gradient orbs */}
        <div className="absolute -left-1/4 top-1/4 h-[500px] w-[500px] rounded-full bg-primary/5 blur-3xl animate-pulse" />
        <div className="absolute -right-1/4 bottom-1/4 h-[500px] w-[500px] rounded-full bg-primary/5 blur-3xl animate-pulse [animation-delay:1s]" />

        {/* Top right controls */}
        <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
          <ModeToggle />
        </div>

        {/* Main content */}
        <div className="w-full max-w-md space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* Logo/Branding section */}
          <div className="flex flex-col items-center space-y-2 text-center">
            <div className="flex h-16 w-16 items-center justify-center transition-transform duration-300 hover:scale-110">
              <LoginLogo width={64} height={64} />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">{tApp("name")}</h1>
            <p className="text-sm text-muted-foreground">
              {t("welcome")}
            </p>
          </div>

          {/* Login Card */}
          <Card className="border-2 shadow-xl backdrop-blur-sm bg-card/95 animate-in fade-in slide-in-from-bottom-6 duration-700 [animation-delay:200ms]">
            <CardHeader className="space-y-1 pb-4">
              <CardTitle className="text-2xl font-bold text-center">
                {t("title")}
              </CardTitle>
              <CardDescription className="text-center">
                {t("description")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LoginForm />
            </CardContent>
          </Card>

          {/* Footer */}
          <p className="text-center text-xs text-muted-foreground animate-in fade-in duration-1000 [animation-delay:400ms]">
            {t("copyright")}
          </p>
        </div>
      </div>
    </>
  );
}
