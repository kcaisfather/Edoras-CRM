"use client";

import { useTranslations } from "next-intl";
import { FileQuestion, Home, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useRouter } from "@/lib/navigation";

export function NotFoundPage() {
  const t = useTranslations("errors.notFound");
  const router = useRouter();

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-background via-background to-muted/20" />
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />

      <Card className="w-full max-w-md text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
        <CardHeader className="space-y-4">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-muted">
            <FileQuestion className="h-10 w-10 text-muted-foreground" />
          </div>
          <div className="space-y-2">
            <CardTitle className="text-4xl font-bold">404</CardTitle>
            <CardTitle className="text-xl">{t("title")}</CardTitle>
            <CardDescription className="text-base">
              {t("description")}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button
            variant="outline"
            onClick={() => router.push("/")}
          >
            <Home />
            {t("backHome")}
          </Button>
          <Button onClick={() => router.push("/dashboard")}>
            <LayoutDashboard />
            {t("backDashboard")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
