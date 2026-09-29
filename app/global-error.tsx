"use client";

import "./globals.css";
import { GlobalErrorPage } from "@/features/errors/components/GlobalErrorPage";
import trMessages from "@/messages/tr.json";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/** Kök layout da çöktüğünde çizilir (sağlayıcılar yok) — metinler doğrudan tr.json'dan. */
export default function GlobalError({ error, reset }: GlobalErrorProps) {
  return (
    <html lang="tr">
      <body>
        <GlobalErrorPage error={error} reset={reset} translations={trMessages.errors.globalError} />
      </body>
    </html>
  );
}
