"use client";

import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import { CoverageNote } from "@/components/ui/coverage-note";
import { QueryErrorState } from "@/components/query-error-state";
import { useMounted } from "@/lib/hooks/use-mounted";

export function ListState({
  isLoading,
  isError,
  onRetry,
  truncated,
  loaded,
  total,
  children,
}: {
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  truncated?: boolean;
  loaded?: number;
  total?: number;
  children: React.ReactNode;
}) {
  const t = useTranslations("list");
  const mounted = useMounted();
  if (!mounted || isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-9 w-full max-w-md rounded-lg" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }
  if (isError) return <QueryErrorState onRetry={onRetry} />;
  return (
    <>
      {truncated && <CoverageNote>{t("truncated", { loaded: loaded ?? 0, total: total ?? 0 })}</CoverageNote>}
      {children}
    </>
  );
}
