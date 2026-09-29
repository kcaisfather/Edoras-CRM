"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reportClientError } from "@/lib/monitoring/client-errors";

interface GlobalErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
  translations: {
    title: string;
    description: string;
    refresh: string;
  };
}

export function GlobalErrorPage({
  error,
  reset,
  translations,
}: GlobalErrorPageProps) {
  useEffect(() => {
    reportClientError(error, "global-boundary");
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-background text-foreground">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card text-card-foreground p-6 text-center shadow-lg">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle className="h-8 w-8 text-destructive" />
        </div>
        <h1 className="mb-2 text-xl font-semibold">{translations.title}</h1>
        <p className="mb-6 text-muted-foreground">{translations.description}</p>
        <Button onClick={reset}>
          <RotateCcw />
          {translations.refresh}
        </Button>
      </div>
    </div>
  );
}
