"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@/lib/navigation";
import { ApiError, apiRequest } from "@/lib/api/client";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { homePathFor } from "@/lib/permissions";
import type { CurrentUser } from "@/lib/domain/auth/types";
import { authKeys } from "./queries";

export interface LoginRequest {
  email: string;
  password: string;
}

/** Supabase Auth hatası → ApiError (form durum koduna göre çevrilmiş mesaj gösterir). */
function authError(status: number | undefined): ApiError {
  // 400 = hatalı e-posta/şifre; 0/yok = ağ.
  if (status === 400) return new ApiError("Invalid credentials", 401);
  if (!status) return new ApiError("Network error", 0);
  return new ApiError("Auth error", status);
}

/**
 * Giriş: Supabase Auth (e-posta + şifre, oturum çereze yazılır) → /api/auth/me ile CRM yetkisi.
 * crm_staff kaydı olmayan hesap 403 NOT_STAFF alır; o durumda oturum hemen kapatılır.
 */
export function useLogin() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: async ({ email, password }: LoginRequest): Promise<CurrentUser> => {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw authError(error.status);
      try {
        return await apiRequest<CurrentUser>("/api/auth/me");
      } catch (err) {
        await supabase.auth.signOut();
        throw err;
      }
    },
    onSuccess: (user) => {
      queryClient.setQueryData(authKeys.currentUser(), user);
      router.replace(homePathFor(user.role));
      router.refresh();
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: async () => {
      await getSupabaseBrowserClient().auth.signOut();
    },
    onSettled: () => {
      queryClient.clear();
      router.replace("/login");
      router.refresh();
    },
  });
}

/** Kendi şifresini değiştirir. Eski şifre yeniden giriş denenerek doğrulanır (Supabase bunu istemez). */
export function useChangePassword() {
  return useMutation({
    mutationFn: async ({ email, oldPassword, newPassword }: { email: string; oldPassword: string; newPassword: string }) => {
      const supabase = getSupabaseBrowserClient();
      const check = await supabase.auth.signInWithPassword({ email, password: oldPassword });
      if (check.error) throw authError(check.error.status);
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw new ApiError(error.message, error.status === 422 ? 422 : (error.status ?? 500));
    },
  });
}
