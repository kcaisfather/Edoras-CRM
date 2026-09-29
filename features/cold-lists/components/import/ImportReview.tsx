"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { CoverageNote } from "@/components/ui/coverage-note";
import { cn } from "@/lib/utils";
import { isCrmStatus } from "@/lib/domain/crm/types";
import { hasInvalidEmail, hasInvalidPhone, recordDisplayName, type ImportRecord } from "@/lib/import/records";
import { RESOLUTIONS, type DuplicateGroup, type ExistingContact, type Resolution } from "@/lib/import/duplicates";
import { NEW_LIST, type ImportFlow } from "./use-import-flow";

const PREVIEW_ROWS = 10;
const GROUPS_PAGE = 30;

export function Stat({ label, value, tone }: { label: string; value: number; tone?: "warn" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1",
        tone === "warn" ? "border-warning/30 bg-warning/10 text-warning" : "border-border bg-muted/50"
      )}
    >
      <span className="font-semibold tabular-nums">{value}</span>
      {label}
    </span>
  );
}

/** Önizleme tablosu: ilk 10 satır; geçersiz telefon / e-posta kırmızı. */
function PreviewTable({ records }: { records: readonly ImportRecord[] }) {
  const t = useTranslations("growth.import");
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">{t("previewTitle", { count: Math.min(PREVIEW_ROWS, records.length), total: records.length })}</h3>
      <div className="overflow-x-auto rounded-xl border border-border/60">
        <table className="w-full min-w-max text-xs">
          <thead className="bg-muted/40 text-left text-muted-foreground">
            <tr>
              <th className="px-2 py-1.5">{t("cols.row")}</th>
              <th className="px-2 py-1.5">{t("cols.name")}</th>
              <th className="px-2 py-1.5">{t("fields.organization")}</th>
              <th className="px-2 py-1.5">{t("fields.phone")}</th>
              <th className="px-2 py-1.5">{t("fields.email")}</th>
              <th className="px-2 py-1.5">{t("fields.city")}</th>
              <th className="px-2 py-1.5">{t("fields.branch")}</th>
            </tr>
          </thead>
          <tbody>
            {records.slice(0, PREVIEW_ROWS).map((r) => (
              <tr key={r.id} className="border-t border-border/40">
                <td className="px-2 py-1.5 tabular-nums text-muted-foreground">{r.rowNumber}</td>
                <td className="px-2 py-1.5">{[r.firstName, r.lastName].filter(Boolean).join(" ") || "—"}</td>
                <td className="px-2 py-1.5">{r.organization || "—"}</td>
                <td className={cn("px-2 py-1.5 tabular-nums", hasInvalidPhone(r) && "text-destructive")}>
                  {r.phone ?? (r.phoneRaw ? `${r.phoneRaw} (${t("invalid")})` : "—")}
                </td>
                <td className={cn("px-2 py-1.5", hasInvalidEmail(r) && "text-destructive")}>{r.email ?? (r.emailRaw || "—")}</td>
                <td className="px-2 py-1.5">{[r.city, r.district].filter(Boolean).join(" / ") || "—"}</td>
                <td className="px-2 py-1.5">{r.branch || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DuplicateCard({
  group,
  records,
  resolution,
  onChange,
}: {
  group: DuplicateGroup;
  records: ImportRecord[];
  resolution: Resolution;
  onChange: (r: Resolution) => void;
}) {
  const t = useTranslations("growth.import");
  const tStatus = useTranslations("crm.status");
  const hasExisting = group.existing.length > 0;
  const existingLabel = (e: ExistingContact) => {
    if (e.source === "crm")
      return e.context && isCrmStatus(e.context) ? t("existing.crmWithStatus", { status: tStatus(e.context) }) : t("existing.crm");
    if (e.source === "coldList") return t("existing.coldList", { list: e.context ?? "" });
    return t(e.context === "DEMO" ? "existing.institutionDemo" : "existing.institutionPaid");
  };
  return (
    <div className="rounded-xl border border-warning/30 bg-warning/[0.06] p-3 text-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="font-medium">{t(group.kind === "phone" ? "samePhone" : "sameEmail", { value: group.value })}</p>
          <ul className="space-y-0.5 text-xs">
            {records.map((r) => (
              <li key={r.id}>
                {recordDisplayName(r)}{" "}
                <span className="text-muted-foreground">({[r.organization, t("fileRow", { row: r.rowNumber })].filter(Boolean).join(", ")})</span>
              </li>
            ))}
            {group.existing.map((e) => (
              <li key={`${e.source}:${e.id}`}>
                {e.name} <span className="text-muted-foreground">({[e.organization, existingLabel(e)].filter(Boolean).join(", ")})</span>
              </li>
            ))}
          </ul>
        </div>
        <SegmentedControl<Resolution>
          value={resolution}
          onValueChange={onChange}
          aria-label={t("resolutionLabel")}
          options={RESOLUTIONS.map((r) => ({ value: r, label: t(`resolutions.${r}`) }))}
        />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{t(`resolutionHints.${resolution}.${hasExisting ? "existing" : "file"}`)}</p>
    </div>
  );
}

/** Mükerrer grupları ve toplu çözüm. */
function DuplicatesSection({ flow }: { flow: ImportFlow }) {
  const t = useTranslations("growth.import");
  const [showAll, setShowAll] = useState(false);
  const { groups, ctx } = flow;
  const recordById = useMemo(() => new Map(flow.records.map((r) => [r.id, r])), [flow.records]);
  const visible = showAll ? groups : groups.slice(0, GROUPS_PAGE);
  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-semibold">{t("dupTitle", { count: groups.length })}</h3>
        {groups.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">{t("applyAll")}</span>
            {RESOLUTIONS.map((r) => (
              <Button
                key={r}
                size="sm"
                variant={flow.fallback === r && Object.values(flow.resolutions).every((x) => x === r) ? "secondary" : "ghost"}
                onClick={() => flow.setAll(r)}
              >
                {t(`resolutions.${r}`)}
              </Button>
            ))}
          </div>
        )}
      </div>
      {ctx.loading && (
        <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          {t("existingLoading")}
        </p>
      )}
      {/* Mevcut kayıtlar okunamazsa önizleme eksik kalır — sessiz geçilmez (sunucu yine de kontrol eder). */}
      {ctx.crmError && <p className="text-xs text-destructive">{t("crmCompareFailed")}</p>}
      {ctx.institutionsError && <p className="text-xs text-destructive">{t("institutionsCompareFailed")}</p>}
      {ctx.listError && <p className="text-xs text-destructive">{t("coldCompareFailed")}</p>}
      <CoverageNote>{t("dupScope")}</CoverageNote>
      {groups.length === 0 && !ctx.loading && <p className="text-sm text-muted-foreground">{t("noDuplicates")}</p>}
      <div className="space-y-2">
        {visible.map((g) => (
          <DuplicateCard
            key={g.key}
            group={g}
            records={g.recordIds.map((id) => recordById.get(id)).filter((x): x is ImportRecord => !!x)}
            resolution={flow.resolutions[g.key] ?? flow.fallback}
            onChange={(r) => flow.setResolutions((prev) => ({ ...prev, [g.key]: r }))}
          />
        ))}
      </div>
      {groups.length > GROUPS_PAGE && !showAll && (
        <Button size="sm" variant="ghost" onClick={() => setShowAll(true)}>
          {t("showAllGroups", { count: groups.length })}
        </Button>
      )}
    </section>
  );
}

/** Soğuk liste hedefinde: hangi liste (mevcut ya da yeni). */
function ListChoice({ flow }: { flow: ImportFlow }) {
  const t = useTranslations("growth.import");
  return (
    <section className="space-y-2">
      <Label htmlFor="import-list">{t("listLabel")}</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          id="import-list"
          value={flow.listChoice}
          onChange={(e) => flow.setListChoice(e.target.value)}
          className="h-9 rounded-lg border border-input bg-background px-2 text-sm sm:w-64"
        >
          <option value={NEW_LIST}>{t("newList")}</option>
          {flow.ctx.lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        {flow.listChoice === NEW_LIST && (
          <Input
            value={flow.newListName}
            maxLength={120}
            aria-label={t("newListName")}
            onChange={(e) => flow.setNewListName(e.target.value)}
            placeholder={t("newListPlaceholder")}
            className="h-9"
          />
        )}
      </div>
    </section>
  );
}

/** 3. adım: önizleme, mükerrer çözümü, liste seçimi. */
export function ReviewStep({ flow }: { flow: ImportFlow }) {
  const t = useTranslations("growth.import");
  const emptyRows = flow.built?.emptyRows ?? 0;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2 text-xs">
        <Stat label={t("stats.rows")} value={flow.records.length} />
        {emptyRows > 0 && <Stat label={t("stats.empty")} value={emptyRows} />}
        {flow.invalidPhones > 0 && <Stat label={t("stats.invalidPhone")} value={flow.invalidPhones} tone="warn" />}
        {flow.invalidEmails > 0 && <Stat label={t("stats.invalidEmail")} value={flow.invalidEmails} tone="warn" />}
        <Stat label={t("stats.groups")} value={flow.groups.length} tone={flow.groups.length ? "warn" : undefined} />
      </div>
      <PreviewTable records={flow.records} />
      <DuplicatesSection flow={flow} />
      {flow.target === "coldList" && <ListChoice flow={flow} />}
      <DialogFooter className="sm:justify-between">
        <Button variant="ghost" onClick={() => flow.setStep("map")}>
          <ArrowLeft />
          {t("back")}
        </Button>
        <Button onClick={flow.goConfirm} disabled={flow.ctx.loading || flow.records.length === 0}>
          {t("next")}
          <ArrowRight />
        </Button>
      </DialogFooter>
    </div>
  );
}
