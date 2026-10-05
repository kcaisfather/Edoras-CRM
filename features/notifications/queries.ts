"use client";

import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { parseSeen, type SeenMap } from "@/lib/domain/notifications/logic";
import { notificationsApi } from "./api";

export const notificationKeys = { all: ["notifications"] as const };

/** Bildirimler: 2 dakikada bir ve sekmeye dönünce tazelenir. */
export function useNotifications() {
  return useQuery({
    queryKey: notificationKeys.all,
    queryFn: ({ signal }) => notificationsApi.get(signal),
    staleTime: 60 * 1000,
    refetchInterval: 2 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
}

const storageKey = (userId: string) => `edoras-crm:notifications-seen:${userId}`;

function readSeen(userId: string | undefined): SeenMap {
  if (!userId) return {};
  try {
    return parseSeen(window.localStorage.getItem(storageKey(userId)));
  } catch {
    return {};
  }
}

/**
 * Görülmüş bildirim imzaları (kullanıcı başına, tarayıcıda). Depolama kapalı / bozuksa sessizce boş çalışır: bildirimler
 * her açılışta okunmamış görünür ama hiçbir şey bozulmaz. Kullanıcı kimliği değişince (profil yüklenince) yeniden okunur;
 * rozet yalnız sorgu verisiyle çizildiği için sunucu ve ilk istemci render'ı aynıdır.
 */
export function useSeen(userId: string | undefined): [SeenMap, (next: Record<string, string>) => void] {
  const [state, setState] = useState<{ userId: string | undefined; seen: SeenMap }>(() => ({ userId, seen: readSeen(userId) }));
  if (state.userId !== userId) setState({ userId, seen: readSeen(userId) });

  const save = useCallback(
    (next: Record<string, string>) => {
      setState({ userId, seen: next });
      if (!userId) return;
      try {
        window.localStorage.setItem(storageKey(userId), JSON.stringify(next));
      } catch {
        // Depolama kullanılamıyor (özel pencere vb.): yalnız bu oturumda görüldü sayılır.
      }
    },
    [userId]
  );
  return [state.seen, save];
}
