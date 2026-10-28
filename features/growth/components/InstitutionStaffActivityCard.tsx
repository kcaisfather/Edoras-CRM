"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { UsersRound } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { InfoTip } from "@/components/ui/info-tip";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CsvButton, DesktopTable, EmptyRow, MobileCard, MobileCardList } from "@/components/list";
import { formatDate } from "@/features/institutions";
import { cn } from "@/lib/utils";
import { DEFAULT_WINDOW_DAYS } from "@/lib/domain/growth/usage";
import {
  STAFF_COLUMNS,
  STAFF_WINDOW_ALL,
  STAFF_WINDOW_OPTIONS,
  cellValue,
  idleStaffCount,
  type StaffActivityRow,
  type StaffColumn,
} from "@/lib/domain/growth/staff-activity";
import { useStaffActivity } from "../queries";
import { TABLE, TH, formatNumber } from "./shared";

/**
 * Kurum ayrıntısının altındaki "Öğretmen kullanımı" kartı (tam genişlik): personel × işlem türü. Hücre = işlem sayısı
 * (aynı dakika = 1), ipucunda kayıt + gün. Ödev dört sütun: "Toplu ödev" (öğrenci / sınıf × oluşturma haftası) +
 * "Toplu ödev onayı" (onaylanan paket) ve "Tekli ödev" (öğrenciye düşen görev) + "Tekli ödev onayı"; ipuçları birbirini gösterir. Hücre değeri `cellValue`'dan. "Aktif gün" kişinin
 * tüm işlemleri birlikte (toplanmış değil). Veri Edoras RPC'sinden salt okunur (5 dk önbellekli); işlemi olmayan etkin
 * öğretmenler de listelenir. Her sütun başlığının üzerine gelince ne saydığı açılır (`colHints`); pencere 7/30/90 gün
 * ya da Tümü.
 */
export function InstitutionStaffActivityCard({ institutionId }: { institutionId: string }) {
  const t = useTranslations("growth.staffActivity");
  const tw = useTranslations("growth.analytics");
  const [windowDays, setWindowDays] = useState<number>(DEFAULT_WINDOW_DAYS);
  const query = useStaffActivity(institutionId, windowDays);
  const data = query.data;
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const activeStaff = rows.filter((r) => r.active).length;
  const idle = idleStaffCount(rows);

  const cellTitle = (r: StaffActivityRow, c: StaffColumn) => {
    const { events, sessions, days } = r.cells[c];
    if (c === "assignment") return t("cellTitleAssignment", { events, days });
    if (c === "assignmentTasks") return t("cellTitleAssignmentTasks", { sessions, days });
    if (c === "assignmentApproved") return t("cellTitleAssignmentApproved", { events, days });
    if (c === "reviewApproved") return t("cellTitleDays", { days });
    if (c === "web") return t("cellTitleWeb", { days });
    return t("cellTitle", { events, days });
  };
  const csvRows = () =>
    rows.map((r) => [
      r.name ?? t("unknown"),
      r.branch ?? "",
      t(`role.${r.role}`),
      ...STAFF_COLUMNS.map((c) => cellValue(r, c)),
      r.activeDays,
      r.lastDay ?? "",
    ]);

  return (
    <Card className="glass-panel rounded-2xl border-border/50 p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold leading-tight">
            <UsersRound className="h-5 w-5 text-primary" />
            {t("title")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl<string>
            value={String(windowDays)}
            onValueChange={(v) => setWindowDays(Number(v))}
            aria-label={tw("windowLabel")}
            options={STAFF_WINDOW_OPTIONS.map((d) => ({
              value: String(d),
              label: d === STAFF_WINDOW_ALL ? t("windowAll") : tw("windowOption", { days: d }),
            }))}
          />
          <CsvButton
            filename="ogretmen-kullanimi"
            header={[t("cols.name"), t("cols.branch"), t("cols.role"), ...STAFF_COLUMNS.map((c) => t(`cols.${c}`)), t("cols.activeDays"), t("cols.lastDay")]}
            rows={csvRows}
          />
        </div>
      </div>

      {query.isLoading ? (
        <Skeleton className="h-48 w-full rounded-xl" />
      ) : query.isError || !data ? (
        <p className="text-sm text-muted-foreground">{t("unavailable")}</p>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {data.windowDays === STAFF_WINDOW_ALL
              ? t("summaryAll", { active: activeStaff - idle, total: activeStaff })
              : t("summary", { active: activeStaff - idle, total: activeStaff, days: data.windowDays })}
            {idle > 0 ? <span className="ml-1 text-warning">{t("idle", { count: idle })}</span> : null}
          </p>

          <DesktopTable>
            <Table className={TABLE} containerClassName={SCROLL_BOX}>
              <TableHeader>
                <TableRow>
                  <TableHead className={cn(TH, STICKY_CORNER)}>
                    <HeaderHint column="name" align="start" />
                  </TableHead>
                  {STAFF_COLUMNS.map((c) => (
                    <TableHead key={c} className={cn(TH, STICKY_HEAD, "text-right")}>
                      <HeaderHint column={c} />
                    </TableHead>
                  ))}
                  <TableHead className={cn(TH, STICKY_HEAD, "text-right")}>
                    <HeaderHint column="activeDays" />
                  </TableHead>
                  <TableHead className={cn(TH, STICKY_HEAD)}>
                    <HeaderHint column="lastDay" />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? <EmptyRow colSpan={STAFF_COLUMNS.length + 3} /> : null}
                {rows.map((r) => (
                  <TableRow key={r.userId} className={r.activeDays === 0 ? "text-muted-foreground" : undefined}>
                    <TableCell className={cn(STICKY_NAME, "z-10 bg-card")}>
                      <PersonCell row={r} />
                    </TableCell>
                    {STAFF_COLUMNS.map((c) => (
                      <TableCell key={c} className="text-right tabular-nums" title={cellValue(r, c) > 0 ? cellTitle(r, c) : undefined}>
                        {cellValue(r, c) > 0 ? formatNumber(cellValue(r, c)) : <span className="text-muted-foreground/60">—</span>}
                      </TableCell>
                    ))}
                    <TableCell className="text-right font-semibold tabular-nums">{formatNumber(r.activeDays)}</TableCell>
                    <TableCell className="tabular-nums">{r.lastDay ? formatDate(r.lastDay) : <span className="text-muted-foreground">{t("never")}</span>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DesktopTable>

          <MobileCardList empty={rows.length === 0}>
            {rows.map((r) => (
              <MobileCard key={r.userId}>
                <div className="flex items-start justify-between gap-2">
                  <PersonCell row={r} />
                  <span className="text-right">
                    <span className="block font-semibold tabular-nums">{t("activeDaysShort", { days: r.activeDays })}</span>
                    <span className="block text-xs text-muted-foreground">{r.lastDay ? formatDate(r.lastDay) : t("never")}</span>
                  </span>
                </div>
                <MobileCells row={r} label={(c) => t(`cols.${c}`)} />
              </MobileCard>
            ))}
          </MobileCardList>
        </div>
      )}
    </Card>
  );
}

/** Sütun başlığı: üzerine gelince (ya da dokununca) sütunun ne saydığı açılır. */
function HeaderHint({ column, align = "end" }: { column: StaffColumn | "name" | "activeDays" | "lastDay"; align?: "start" | "end" }) {
  const t = useTranslations("growth.staffActivity");
  const label = t(`cols.${column}`);
  return (
    <InfoTip label={label} align={align} trigger={label}>
      {t(`colHints.${column}`)}
    </InfoTip>
  );
}

/*
 * Kaydırırken başlık ve isimler görünür kalsın: yapışkan hücre EN YAKIN kaydırma kabına yapışır. Tablo yatayda kaydığı
 * için kap dikeyde de kendi içinde kaymalı (yükseklik sınırı) — yoksa sayfa inerken başlık kaçar. Yapışkan hücreler
 * opak zemin ister (satırın yarı saydam tonu hücrenin altında kalır, arkadan geçen satırlar görünmesin).
 */
const SCROLL_BOX = "max-h-[70vh]";
const STICKY_HEAD = "sticky top-0 z-20 bg-muted shadow-[inset_0_-1px_0_hsl(var(--border))]";
const STICKY_NAME = "sticky left-0 shadow-[inset_-1px_0_0_hsl(var(--border))]";
/** Sol üst köşe: hem üste hem sola yapışır, iki kenar çizgisi tek gölgede (iki `shadow-*` sınıfı birbirini ezer). */
const STICKY_CORNER = "sticky left-0 top-0 z-30 bg-muted shadow-[inset_-1px_-1px_0_hsl(var(--border))]";

function PersonCell({ row }: { row: StaffActivityRow }) {
  const t = useTranslations("growth.staffActivity");
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate font-medium text-foreground">{row.name ?? t("unknown")}</span>
      <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
        {row.branch ? <span>{row.branch}</span> : null}
        {row.role === "admin" ? <span>{t("role.admin")}</span> : null}
        {!row.active ? <span className="text-warning">{t("inactive")}</span> : null}
      </span>
    </span>
  );
}

function MobileCells({ row, label }: { row: StaffActivityRow; label: (c: StaffColumn) => string }) {
  const used = STAFF_COLUMNS.filter((c) => cellValue(row, c) > 0);
  if (used.length === 0) return null;
  return (
    <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {used.map((c) => (
        <div key={c} className="flex gap-1">
          <dt className="text-muted-foreground">{label(c)}</dt>
          <dd className="font-medium tabular-nums">{formatNumber(cellValue(row, c))}</dd>
        </div>
      ))}
    </dl>
  );
}
