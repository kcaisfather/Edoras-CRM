"use client";

import { useQuery } from "@tanstack/react-query";
import { crmKeys } from "@/features/crm";
import { PROSPECT_PAGE_MAX } from "@/lib/domain/cold-lists/schemas";
import type { Prospect } from "@/lib/domain/cold-lists/types";
import { coldListsApi } from "./api";

/**
 * Soğuk liste sorgu anahtarları crmKeys altında: aday yazımları (crmKeys.all'u geçersiz kılar) "CRM'de var"
 * eşleşmelerini de tazeler; "Sıcağa taşı" ikisini birden.
 */
export const coldListKeys = {
  all: [...crmKeys.all, "coldLists"] as const,
  lists: () => [...coldListKeys.all, "lists"] as const,
  prospects: (listId: string) => [...coldListKeys.all, "prospects", listId] as const,
};

/** Görevlerim sorgularının kökü (features/tasks → taskKeys.all). Kişinin sonucu değişince görevler yeniden türetilir. */
export const TASKS_ROOT_KEY = [...crmKeys.all, "tasks"] as const;

/** Bir listede okunacak en çok sayfa (1000'er): 20.000 kişi. Fazlası `truncated`. */
const MAX_PAGES = 20;

export function useProspectLists(enabled = true) {
  return useQuery({
    queryKey: coldListKeys.lists(),
    queryFn: ({ signal }) => coldListsApi.lists(signal),
    enabled,
    staleTime: 60 * 1000,
  });
}

export interface ListProspects {
  items: Prospect[];
  total: number;
  truncated: boolean;
}

/**
 * Seçili listenin tüm kişileri (ekleme sırasıyla; ekran istemcide süzer — DeepSport useAllPages). Liste yoksa istek
 * atılmaz.
 */
export function useListProspects(listId: string | null | undefined) {
  return useQuery({
    queryKey: coldListKeys.prospects(listId ?? ""),
    enabled: !!listId,
    staleTime: 30 * 1000,
    queryFn: async ({ signal }): Promise<ListProspects> => {
      const items: Prospect[] = [];
      let total = 0;
      for (let page = 0; page < MAX_PAGES; page++) {
        const res = await coldListsApi.prospectsPage(listId as string, page, PROSPECT_PAGE_MAX, signal);
        items.push(...res.items);
        total = res.total;
        if (items.length >= total || res.items.length < PROSPECT_PAGE_MAX) break;
      }
      return { items, total, truncated: items.length < total };
    },
  });
}
