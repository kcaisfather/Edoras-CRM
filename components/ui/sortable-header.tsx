"use client";

import { useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useRouter } from "@/lib/navigation";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { nextSort, parseSort, type SortState } from "@/lib/utils/sort";

/**
 * Tablo sıralaması URL'de: `?sort=alan&dir=asc|desc` (sayfa numarası `page` sıfırlanır).
 * `keys` o tablonun sıralanabilir alanları; farklı sekmelerde aynı parametre paylaşılır.
 */
export function useUrlSort<K extends string>(keys: readonly K[], param = "sort", dirParam = "dir") {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sort = useMemo(
    () => parseSort(searchParams.get(param), searchParams.get(dirParam), keys),
    // keys sabit dizi olarak verilir
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [searchParams, param, dirParam]
  );
  const toggle = useCallback(
    (key: K) => {
      const next = nextSort(sort, key);
      const params = new URLSearchParams(searchParams.toString());
      if (next) {
        params.set(param, next.key);
        params.set(dirParam, next.dir);
      } else {
        params.delete(param);
        params.delete(dirParam);
      }
      if (params.has("page")) params.set("page", "0");
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [sort, searchParams, router, param, dirParam]
  );
  return { sort, toggle };
}

/**
 * Tıklanabilir sütun başlığı: ArrowUpDown (kapalı) / ArrowUp (artan) / ArrowDown (azalan), `aria-sort`.
 * Döngü: artan → azalan → kapalı.
 */
export function SortableHeader<K extends string>({
  label,
  sortKey,
  sort,
  onSort,
  className,
  align = "left",
}: {
  label: React.ReactNode;
  sortKey: K;
  sort: SortState<K> | null;
  onSort: (key: K) => void;
  className?: string;
  align?: "left" | "right";
}) {
  const t = useTranslations("shell.sort");
  const active = sort?.key === sortKey;
  const dir = active ? sort!.dir : null;
  const Icon = dir === "asc" ? ArrowUp : dir === "desc" ? ArrowDown : ArrowUpDown;
  return (
    <TableHead
      aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : "none"}
      className={cn(align === "right" && "text-right", className)}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        title={dir === "asc" ? t("toDesc") : dir === "desc" ? t("toOff") : t("toAsc")}
        className={cn(
          "inline-flex cursor-pointer items-center gap-1 rounded hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
          align === "right" && "flex-row-reverse",
          active && "text-foreground"
        )}
      >
        {label}
        <Icon className={cn("h-3.5 w-3.5 shrink-0", !active && "opacity-50")} aria-hidden />
      </button>
    </TableHead>
  );
}
