"use client";

import { useEffect } from "react";
import { useRouter } from "@/lib/navigation";
import { homePathFor } from "@/lib/permissions";
import { useCurrentUser } from "../queries";

/** Oturumu açık ve CRM yetkisi olan kullanıcı giriş sayfasına gelirse ana sayfasına gönderilir. */
export function LoginRedirect() {
  const router = useRouter();
  const { data: user } = useCurrentUser();

  useEffect(() => {
    if (user) router.replace(homePathFor(user.role));
  }, [user, router]);

  return null;
}
