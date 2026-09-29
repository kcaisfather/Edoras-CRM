"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { ApiError } from "@/lib/api/client";
import { installClientMonitoring } from "@/lib/monitoring/client-errors";

/** 401/403 tekrar denenmez (oturum/yetki sorunu tekrar denemeyle düzelmez). */
function shouldRetry(failureCount: number, error: unknown) {
  if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return false;
  return failureCount < 1;
}

export function Providers({ children }: { children: React.ReactNode }) {
  // Pencere hataları ve API istek sayacı — tüm sayfalarda (yalnızca bu sekmede tutulur).
  useEffect(() => installClientMonitoring(), []);
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 60 * 1000, gcTime: 5 * 60 * 1000, retry: shouldRetry },
          // Yazma işlemleri tekrar denenmez: demo açma gibi işlemler iki kez çalışmasın.
          mutations: { retry: false },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        {children}
        <Toaster />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
