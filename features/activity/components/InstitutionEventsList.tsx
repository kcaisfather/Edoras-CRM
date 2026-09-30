"use client";

import { useTranslations } from "next-intl";
import { Activity } from "lucide-react";
import { Link } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { CoverageNote } from "@/components/ui/coverage-note";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { INSTITUTION_EVENT_TYPES, MAX_EVENT_WINDOW_DAYS, type InstitutionEvent, type InstitutionEventType } from "@/lib/domain/activity/events";
import { addDays, todayIso } from "@/lib/domain/institutions/rules";
import { useMounted } from "@/lib/hooks/use-mounted";
import { useActivityInstitutions, useInstitutionEvents } from "../queries";
import {
  ALL,
  ActivityErrorState,
  ActivityListSkeleton,
  ClearFiltersButton,
  DateRangeFields,
  ListPagination,
  PageSizeSelect,
  avatarClass,
  formatTimestamp,
  initialsOf,
  useUrlFilters,
} from "./shared";

const DAY = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const formatDay = (iso: string) => DAY.format(new Date(`${iso}T00:00:00Z`));
const PRESETS = [7, 30, 90] as const;

function EventsGrid({ items }: { items: InstitutionEvent[] }) {
  const t = useTranslations("activityHistory");
  const todayLabel = t("today");
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-12 gap-4 px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <div className="col-span-5 lg:col-span-3">{t("events.table.institution")}</div>
        <div className="col-span-4 lg:col-span-4">{t("events.table.event")}</div>
        <div className="hidden items-center lg:col-span-3 lg:flex">{t("events.table.actor")}</div>
        <div className="col-span-3 text-right lg:col-span-2">{t("table.timestamp")}</div>
      </div>
      {items.map((e, index) => (
        <div
          key={e.id}
          className="grid grid-cols-12 items-center gap-4 rounded-2xl border border-border/70 bg-card/70 p-4 shadow-sm transition-colors hover:border-border hover:bg-muted/50"
        >
          <div className="col-span-5 flex min-w-0 items-center gap-3 lg:col-span-3">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-sm font-bold ${avatarClass(index)}`}>{initialsOf(e.institutionName)}</span>
            <Link href={`/institutions/${e.institutionId}`} className="truncate text-sm font-bold tracking-wide hover:underline">
              {e.institutionName}
            </Link>
          </div>
          <div className="col-span-4 min-w-0 lg:col-span-4">
            <p className="truncate text-sm font-medium tracking-wide">{t(`events.types.${e.type}`)}</p>
            {e.count !== null && e.count > 0 ? (
              <p className="truncate text-xs text-muted-foreground">{t(e.type === "SMS_SENT" ? "events.countRecipients" : "events.countStudents", { count: e.count })}</p>
            ) : null}
          </div>
          <div className="hidden items-center lg:col-span-3 lg:flex">
            {e.actorRole ? (
              <span className="inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium">{t(`events.roles.${e.actorRole}`)}</span>
            ) : (
              <span className="text-xs text-muted-foreground">{t("events.roleUnknown")}</span>
            )}
          </div>
          <div className="col-span-3 flex flex-col items-end justify-center text-right lg:col-span-2">
            <p className="text-sm font-medium tracking-tight">{formatTimestamp(e.at, todayLabel)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Kurum etkinliği: Edoras kurumlarının öğretmen / yönetici etkinlikleri (yoklama, ödev, deneme, konu işleme, duyuru, elle SMS)
 * tek zaman çizelgesinde. Süzgeçler URL'de (?inst=, ?type=, ?from=, ?to=, ?page=, ?size=) ve sunucuda uygulanır; aralık
 * en çok 90 gün, varsayılan son 7 gün. Öğrenci adı ya da kişisel veri gösterilmez.
 */
export function InstitutionEventsList() {
  const t = useTranslations("activityHistory");
  const f = useUrlFilters();
  const mounted = useMounted();
  const institutionId = f.get("inst");
  const typeParam = f.get("type");
  const type = (INSTITUTION_EVENT_TYPES as readonly string[]).includes(typeParam) ? typeParam : "";
  const today = todayIso();

  const institutions = useActivityInstitutions(true);
  const { data, isLoading, isError, refetch } = useInstitutionEvents(
    { institutionId, type, from: f.from, to: f.to, page: f.page, size: f.size },
    true
  );

  if (!mounted || (isLoading && !data)) return <ActivityListSkeleton />;
  if (isError && !data) return <ActivityErrorState onRetry={() => void refetch()} />;

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const page = data?.page ?? f.page;
  const totalPages = Math.max(1, (data?.lastPage ?? 0) + 1);
  const filtered = Boolean(institutionId || type || f.from || f.to);
  const preset = (days: number) => f.patch({ from: addDays(today, -(days - 1)), to: today });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card/60 p-4 lg:flex-row lg:flex-wrap lg:items-end">
        <div className="flex items-center gap-2">
          <label htmlFor="ev-inst" className="text-sm text-muted-foreground">
            {t("events.filters.institution")}:
          </label>
          <Select value={institutionId || ALL} onValueChange={(v) => f.patch({ inst: v === ALL ? "" : v })}>
            <SelectTrigger id="ev-inst" className="min-w-[13rem] max-w-[18rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("events.filters.allInstitutions")}</SelectItem>
              {(institutions.data ?? []).map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="ev-type" className="text-sm text-muted-foreground">
            {t("filters.logType.label")}:
          </label>
          <Select value={type || ALL} onValueChange={(v) => f.patch({ type: v === ALL ? "" : v })}>
            <SelectTrigger id="ev-type" className="min-w-[13rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("filters.logType.all")}</SelectItem>
              {INSTITUTION_EVENT_TYPES.map((k: InstitutionEventType) => (
                <SelectItem key={k} value={k}>
                  {t(`events.types.${k}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DateRangeFields idPrefix="ev" from={f.from} to={f.to} max={today} onChange={(c) => f.patch(c)} />
        <div className="flex items-center gap-1.5" role="group" aria-label={t("events.filters.presets")}>
          {PRESETS.map((d) => (
            <Button key={d} size="sm" variant="outline" onClick={() => preset(d)}>
              {t("events.filters.lastDays", { days: d })}
            </Button>
          ))}
        </div>
        {filtered ? <ClearFiltersButton onClick={() => f.patch({ inst: "", type: "", from: "", to: "" })} /> : null}
        <PageSizeSelect id="ev-size" size={f.size} onChange={(v) => f.patch({ size: v })} />
      </div>

      <div className="space-y-1.5">
        {data ? (
          <CoverageNote>{t("events.window", { from: formatDay(data.window.from), to: formatDay(data.window.to) })}</CoverageNote>
        ) : null}
        <CoverageNote>{t("events.scopeNote")}</CoverageNote>
        {data?.window.clamped ? <CoverageNote>{t("events.clamped", { days: MAX_EVENT_WINDOW_DAYS })}</CoverageNote> : null}
        {data?.truncated ? <CoverageNote>{t("events.truncated", { max: 1000 })}</CoverageNote> : null}
        {data && data.unavailable.length > 0 ? (
          <CoverageNote>{t("events.unavailable", { sources: data.unavailable.map((k) => t(`events.types.${k}`)).join(", ") })}</CoverageNote>
        ) : null}
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Activity className="mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="text-lg font-semibold">{t("empty.title")}</h3>
        </div>
      ) : (
        <>
          <EventsGrid items={items} />
          <ListPagination page={page} totalPages={totalPages} size={f.size} total={total} onPageChange={(p) => f.patch({ page: p ? String(p) : "" }, false)} />
        </>
      )}
    </div>
  );
}
