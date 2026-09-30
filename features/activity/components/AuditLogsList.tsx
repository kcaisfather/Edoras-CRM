"use client";

import { useTranslations } from "next-intl";
import { ScrollText } from "lucide-react";
import { Link } from "@/lib/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES, isAuditAction, isAuditEntityType } from "@/lib/domain/activity/audit-actions";
import type { AuditDetailValue, AuditLogEntry } from "@/lib/domain/activity/audit-logs";
import { useStaff } from "@/features/settings";
import { useMounted } from "@/lib/hooks/use-mounted";
import { useAuditLogs } from "../queries";
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ayrıntı değerini düz METİN olarak hazırlar (kimlikler kısaltılır; HTML olarak asla çizilmez). */
function detailText(value: AuditDetailValue, yes: string, no: string): string {
  if (value === null) return "—";
  if (typeof value === "boolean") return value ? yes : no;
  if (typeof value === "string" && UUID.test(value)) return `${value.slice(0, 8)}…`;
  return String(value);
}

function DetailChips({ details }: { details: AuditLogEntry["details"] }) {
  const t = useTranslations("activityHistory");
  const entries = Object.entries(details);
  if (entries.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      {entries.map(([key, value]) => (
        <span key={key} className="inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-muted/60 px-1.5 py-0.5 text-[11px]">
          <span className="text-muted-foreground">{t.has(`audit.detailKeys.${key}`) ? t(`audit.detailKeys.${key}`) : key}:</span>
          <span className="truncate font-medium text-foreground">{detailText(value, t("audit.yes"), t("audit.no"))}</span>
        </span>
      ))}
    </div>
  );
}

function AuditGrid({ items }: { items: AuditLogEntry[] }) {
  const t = useTranslations("activityHistory");
  const todayLabel = t("today");
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-12 gap-4 px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <div className="col-span-4 lg:col-span-3">{t("audit.table.actor")}</div>
        <div className="col-span-5 lg:col-span-7">{t("audit.table.action")}</div>
        <div className="col-span-3 text-right lg:col-span-2">{t("table.timestamp")}</div>
      </div>
      {items.map((row, index) => {
        const action = isAuditAction(row.action) ? t(`audit.actions.${row.action}`) : row.action;
        const entity = isAuditEntityType(row.entityType) ? t(`audit.entities.${row.entityType}`) : row.entityType;
        const institutionLink = row.entityType === "institution" && row.entityId && UUID.test(row.entityId) ? `/institutions/${row.entityId}` : null;
        return (
          <div
            key={row.id}
            className="grid grid-cols-12 items-start gap-4 rounded-2xl border border-border/70 bg-card/70 p-4 shadow-sm transition-colors hover:border-border hover:bg-muted/50"
          >
            <div className="col-span-4 flex min-w-0 items-center gap-3 lg:col-span-3">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-sm font-bold ${avatarClass(index)}`}>{initialsOf(row.actorName)}</span>
              <p className="truncate text-sm font-bold tracking-wide">{row.actorName ?? t("audit.unknownActor")}</p>
            </div>
            <div className="col-span-5 min-w-0 lg:col-span-7">
              <p className="truncate text-sm font-medium tracking-wide">{action}</p>
              <p className="truncate text-xs text-muted-foreground">
                {entity}
                {row.entityLabel ? (
                  <>
                    {" · "}
                    {institutionLink ? (
                      <Link href={institutionLink} className="hover:underline">
                        {row.entityLabel}
                      </Link>
                    ) : (
                      row.entityLabel
                    )}
                  </>
                ) : null}
              </p>
              <DetailChips details={row.details} />
            </div>
            <div className="col-span-3 flex flex-col items-end text-right lg:col-span-2">
              <p className="text-sm font-medium tracking-tight">{formatTimestamp(row.at, todayLabel)}</p>
              <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">#{row.id}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * CRM işlem kaydı (crm_audit_logs — yalnız eklenir): kim, ne zaman, hangi kayıt üzerinde ne yaptı. Süzgeçler URL'de
 * (?actor=, ?action=, ?entity=, ?from=, ?to=, ?page=, ?size=) ve sunucuda uygulanır. Yalnız ADMIN.
 */
export function AuditLogsList() {
  const t = useTranslations("activityHistory");
  const f = useUrlFilters();
  const mounted = useMounted();
  const actorId = UUID.test(f.get("actor")) ? f.get("actor") : "";
  const action = isAuditAction(f.get("action")) ? f.get("action") : "";
  const entityType = isAuditEntityType(f.get("entity")) ? f.get("entity") : "";

  const staff = useStaff();
  const { data, isLoading, isError, refetch } = useAuditLogs({ actorId, action, entityType, from: f.from, to: f.to, page: f.page, size: f.size }, true);

  if (!mounted || (isLoading && !data)) return <ActivityListSkeleton />;
  if (isError && !data) return <ActivityErrorState onRetry={() => void refetch()} />;

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / f.size));
  const filtered = Boolean(actorId || action || entityType || f.from || f.to);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card/60 p-4 lg:flex-row lg:flex-wrap lg:items-end">
        <div className="flex items-center gap-2">
          <label htmlFor="au-actor" className="text-sm text-muted-foreground">
            {t("audit.filters.actor")}:
          </label>
          <Select value={actorId || ALL} onValueChange={(v) => f.patch({ actor: v === ALL ? "" : v })}>
            <SelectTrigger id="au-actor" className="min-w-[12rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("audit.filters.allActors")}</SelectItem>
              {(staff.data ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.fullName || s.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="au-action" className="text-sm text-muted-foreground">
            {t("audit.filters.action")}:
          </label>
          <Select value={action || ALL} onValueChange={(v) => f.patch({ action: v === ALL ? "" : v })}>
            <SelectTrigger id="au-action" className="min-w-[13rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("filters.logType.all")}</SelectItem>
              {AUDIT_ACTIONS.map((a) => (
                <SelectItem key={a} value={a}>
                  {t(`audit.actions.${a}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="au-entity" className="text-sm text-muted-foreground">
            {t("audit.filters.entity")}:
          </label>
          <Select value={entityType || ALL} onValueChange={(v) => f.patch({ entity: v === ALL ? "" : v })}>
            <SelectTrigger id="au-entity" className="min-w-[11rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("audit.filters.allEntities")}</SelectItem>
              {AUDIT_ENTITY_TYPES.map((e) => (
                <SelectItem key={e} value={e}>
                  {t(`audit.entities.${e}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DateRangeFields idPrefix="au" from={f.from} to={f.to} onChange={(c) => f.patch(c)} />
        {filtered ? <ClearFiltersButton onClick={() => f.patch({ actor: "", action: "", entity: "", from: "", to: "" })} /> : null}
        <PageSizeSelect id="au-size" size={f.size} onChange={(v) => f.patch({ size: v })} />
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <ScrollText className="mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="text-lg font-semibold">{t("empty.title")}</h3>
        </div>
      ) : (
        <>
          <AuditGrid items={items} />
          <ListPagination page={f.page} totalPages={totalPages} size={f.size} total={total} onPageChange={(p) => f.patch({ page: p ? String(p) : "" }, false)} />
        </>
      )}
    </div>
  );
}
