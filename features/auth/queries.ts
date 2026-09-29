"use client";

import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/client";
import type { CurrentUser } from "@/lib/domain/auth/types";

export const authKeys = {
  all: ["auth"] as const,
  currentUser: () => [...authKeys.all, "currentUser"] as const,
};

/** Oturumdaki CRM kullanıcısı (GET /api/auth/me). Oturum yoksa 401 → istemci girişe yollar. */
export function useCurrentUser() {
  return useQuery({
    queryKey: authKeys.currentUser(),
    queryFn: ({ signal }) => apiRequest<CurrentUser>("/api/auth/me", { signal }),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}
