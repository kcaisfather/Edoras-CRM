"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryErrorState } from "@/components/query-error-state";
import { recipientSkipReason } from "@/lib/domain/surveys/logic";
import type { SurveyChannel } from "@/lib/domain/surveys/types";
import type { PickerRecipient } from "../recipients";

/** Listede en çok bu kadar eşleşme çizilir (aramayla daraltılır). */
const VISIBLE_LIMIT = 100;

/**
 * "Anket gönder" alıcı seçici (DeepSport SendSurveyDialog'un CRM listesi): CRM adayları + adayı olmayan kurumlar.
 * Kanalın gerektirdiği iletişimi olmayan kişi işaretlenebilir ama "atlanacak" diye görünür.
 */
export function SendSurveyPicker({
  recipients,
  channel,
  picked,
  onPickedChange,
  running,
  isLoading,
  isError,
  onRetry,
}: {
  recipients: PickerRecipient[];
  channel: SurveyChannel;
  picked: ReadonlySet<string>;
  onPickedChange: (next: Set<string>) => void;
  running: boolean;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  const t = useTranslations("surveys.send");
  const [q, setQ] = useState("");

  const matches = useMemo(() => {
    const query = q.trim().toLocaleLowerCase("tr");
    return query
      ? recipients.filter((r) => [r.name, r.organizationName, r.email, r.phone].some((v) => v?.toLocaleLowerCase("tr").includes(query)))
      : recipients;
  }, [recipients, q]);
  const visible = matches.slice(0, VISIBLE_LIMIT);

  const toggle = (key: string, on: boolean) => {
    const next = new Set(picked);
    if (on) next.add(key);
    else next.delete(key);
    onPickedChange(next);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{t("recipients")}</p>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" disabled={running} onClick={() => onPickedChange(new Set([...picked, ...visible.map((r) => r.key)]))}>
            {t("selectVisible", { count: visible.length })}
          </Button>
          {picked.size > 0 && (
            <Button size="sm" variant="ghost" disabled={running} onClick={() => onPickedChange(new Set())}>
              {t("clear")}
            </Button>
          )}
        </div>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("searchPlaceholder")} aria-label={t("searchLabel")} className="pl-10" />
      </div>
      <div className="max-h-64 overflow-y-auto rounded-lg border border-border">
        {isLoading ? (
          <div className="space-y-2 p-3" aria-busy="true">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-md" />
            ))}
          </div>
        ) : isError ? (
          <div className="p-3">
            <QueryErrorState onRetry={onRetry} />
          </div>
        ) : visible.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("noLeads")}</p>
        ) : (
          <ul className="divide-y divide-border">
            {visible.map((r) => {
              const reason = recipientSkipReason(r, channel);
              return (
                <li key={r.key}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-accent/50">
                    <Checkbox checked={picked.has(r.key)} disabled={running} onCheckedChange={(v) => toggle(r.key, v === true)} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 truncate text-sm">
                        {r.organizationName || r.name}
                        {r.kind === "institution" && (
                          <span className="shrink-0 rounded border border-border px-1 text-[10px] text-muted-foreground">{t("institutionTag")}</span>
                        )}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[r.organizationName ? r.name : null, r.email, r.phone].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    {reason && <span className="shrink-0 text-xs text-warning">{t(`skip.${reason}`)}</span>}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {matches.length > visible.length && (
        <p className="text-xs text-muted-foreground">{t("listCapped", { shown: visible.length, total: matches.length })}</p>
      )}
    </div>
  );
}
