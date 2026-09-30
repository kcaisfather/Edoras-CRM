"use client";

import { useLocale, useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { Link } from "@/lib/navigation";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/utils";
import { RENEWAL_WINDOW_DAYS } from "@/lib/domain/growth/renewals";
import {
  COHORT_MAX_OFFSET,
  COHORT_MONTHS,
  CONTINUATION_STATUSES,
  LOW_CONFIDENCE_MIN,
  RECENT_OUTCOME_DAYS,
  RENEWAL_GRACE_DAYS,
  TREND_MONTHS,
  type ChurnMonth,
  type CohortMatrixRow,
  type ContinuationBreakdown,
  type ContinuationStatus,
  type RetentionCurvePoint,
} from "@/lib/domain/growth/retention";

/**
 * Grafikler kütüphanesiz (CSS/SVG): DeepSport'un recharts sürümündeki aynı görünümler. Renkler tema değişkenlerinden;
 * yenilendi = mavi (primary), churn = kırmızı — yeşil/kırmızı çifti renk körlüğünde ayrışmaz.
 */
const CARD = "rounded-2xl border border-border/60 bg-card/60 p-4";

export function usePercentFormat() {
  const locale = useLocale();
  const nf = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 });
  return (ratio: number | null | undefined) => (ratio == null || !Number.isFinite(ratio) ? "—" : nf.format(ratio));
}

function useMonthLabel() {
  const locale = useLocale();
  return (month: string) => {
    const [y, m] = month.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(locale, { month: "short", year: "2-digit", timeZone: "UTC" });
  };
}

/** Kart başlığı + tanım ipucu. */
export function CardHeader({ title, def, children }: { title: string; def: string; children?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold">
        {title}
        <InfoTip label={title} align="start">
          {def}
        </InfoTip>
      </h3>
      {children}
    </div>
  );
}

function Swatch({ className }: { className: string }) {
  return <span aria-hidden className={cn("inline-block h-2.5 w-2.5 shrink-0 rounded-sm", className)} />;
}

// ---------------------------------------------------------------------------
// Aylık churn / yenileme (yüzde yığılmış sütun)
// ---------------------------------------------------------------------------

export function ChurnTrendChart({ months }: { months: ChurnMonth[] }) {
  const t = useTranslations("growth.retentionChurn.trend");
  const pct = usePercentFormat();
  const label = useMonthLabel();
  const any = months.some((m) => m.decided > 0);
  return (
    <section className={CARD}>
      <CardHeader title={t("title", { months: TREND_MONTHS })} def={t("def", { grace: RENEWAL_GRACE_DAYS })}>
        <span className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Swatch className="bg-primary" />
            {t("renewed")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Swatch className="bg-destructive" />
            {t("churned")}
          </span>
        </span>
      </CardHeader>
      {!any ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{t("noData")}</p>
      ) : (
        <div className="flex h-44 items-end gap-1.5" role="img" aria-label={t("title", { months: TREND_MONTHS })}>
          {months.map((m) => {
            const tip = m.decided
              ? `${label(m.month)} · ${t("churned")} ${pct(m.churnRate)} · ${t("renewed")} ${pct(m.renewalRate)} · ${t("counts", { renewed: m.renewed, churned: m.churned, decided: m.decided })}${m.pending ? ` · ${t("pending", { count: m.pending })}` : ""}${m.lowConfidence ? ` · ${t("lowConfidence", { min: LOW_CONFIDENCE_MIN })}` : ""}`
              : `${label(m.month)} · ${t("noData")}`;
            return (
              <div key={m.month} className="flex h-full min-w-0 flex-1 flex-col items-center gap-1" title={tip}>
                <div className={cn("flex w-full flex-1 flex-col-reverse overflow-hidden rounded-md bg-muted/50", m.lowConfidence && "opacity-40")}>
                  {m.decided > 0 ? (
                    <>
                      <span className="block w-full bg-primary" style={{ height: `${(m.renewalRate ?? 0) * 100}%` }} />
                      <span className="block w-full bg-destructive" style={{ height: `${(m.churnRate ?? 0) * 100}%` }} />
                    </>
                  ) : null}
                </div>
                <span className="text-[10px] text-muted-foreground">{label(m.month)}</span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Kohort ısı haritası + eğri
// ---------------------------------------------------------------------------

function HeatCell({ ratio, partial, label }: { ratio: { count: number; of: number }; partial: boolean; label: string }) {
  const value = ratio.of ? ratio.count / ratio.of : 0;
  return (
    <td
      title={label}
      className={cn("px-1.5 py-1 text-center text-[11px] tabular-nums", partial && "italic")}
      style={{ backgroundColor: `color-mix(in oklab, hsl(var(--primary)) ${Math.round(value * 70)}%, transparent)` }}
    >
      {Math.round(value * 100)}
    </td>
  );
}

export function CohortHeatmap({ rows }: { rows: CohortMatrixRow[] }) {
  const t = useTranslations("growth.retentionChurn.cohort");
  const label = useMonthLabel();
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max border-separate border-spacing-0.5 text-xs">
        <thead>
          <tr className="text-muted-foreground">
            <th className="px-2 py-1 text-left font-medium">{t("month")}</th>
            <th className="px-2 py-1 text-right font-medium">{t("size")}</th>
            {Array.from({ length: COHORT_MAX_OFFSET + 1 }, (_, k) => (
              <th key={k} className="px-1.5 py-1 text-center font-medium">
                M{k}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.month}>
              <td className="whitespace-nowrap px-2 py-1">{label(r.month)}</td>
              <td className="px-2 py-1 text-right tabular-nums">{r.size}</td>
              {r.cells.map((c, k) =>
                c ? (
                  <HeatCell key={k} ratio={c.ratio} partial={c.partial} label={t("cellTitle", { k, count: c.ratio.count, of: c.ratio.of })} />
                ) : (
                  <td key={k} className="bg-muted/30" />
                )
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RetentionCurveChart({ curve }: { curve: RetentionCurvePoint[] }) {
  const t = useTranslations("growth.retentionChurn.cohort");
  const pct = usePercentFormat();
  if (curve.length === 0) return null;
  const W = 480;
  const H = 140;
  const pad = { l: 34, r: 8, t: 8, b: 20 };
  const x = (k: number) => pad.l + (k / COHORT_MAX_OFFSET) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v) * (H - pad.t - pad.b);
  const points = curve.map((p) => ({ ...p, v: p.ratio.of ? p.ratio.count / p.ratio.of : 0 }));
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.offset).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={t("curveTitle")}>
      {[0, 0.5, 1].map((g) => (
        <g key={g}>
          <line x1={pad.l} x2={W - pad.r} y1={y(g)} y2={y(g)} stroke="hsl(var(--border))" strokeDasharray="3 3" />
          <text x={pad.l - 6} y={y(g) + 3} textAnchor="end" fontSize="10" fill="hsl(var(--muted-foreground))">
            {Math.round(g * 100)}%
          </text>
        </g>
      ))}
      {[0, 3, 6, 9, 12].map((k) => (
        <text key={k} x={x(k)} y={H - 6} textAnchor="middle" fontSize="10" fill="hsl(var(--muted-foreground))">
          M{k}
        </text>
      ))}
      <path d={path} fill="none" stroke="hsl(var(--primary))" strokeWidth="2" />
      {points.map((p) => (
        <circle key={p.offset} cx={x(p.offset)} cy={y(p.v)} r="3" fill={p.lowConfidence ? "transparent" : "hsl(var(--primary))"} stroke="hsl(var(--primary))" strokeWidth="1.5">
          <title>{`M${p.offset} · ${pct(p.v)} (${p.ratio.count}/${p.ratio.of})${p.lowConfidence ? ` · ${t("lowConfidence", { min: LOW_CONFIDENCE_MIN })}` : ""}`}</title>
        </circle>
      ))}
    </svg>
  );
}

export function CohortSection({ rows, curve }: { rows: CohortMatrixRow[]; curve: RetentionCurvePoint[] }) {
  const t = useTranslations("growth.retentionChurn.cohort");
  return (
    <section className={CARD}>
      <CardHeader title={t("title", { months: COHORT_MONTHS })} def={t("def", { grace: RENEWAL_GRACE_DAYS })} />
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t("noData")}</p>
      ) : (
        <div className="space-y-4">
          <CohortHeatmap rows={rows} />
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">{t("curveTitle")}</p>
            <RetentionCurveChart curve={curve} />
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Anlık devam durumu
// ---------------------------------------------------------------------------

const STATUS_BG: Record<ContinuationStatus, string> = {
  activeUsing: "bg-success",
  renewed: "bg-primary",
  activeNotUsing: "bg-caution",
  expiring: "bg-warning",
  churned: "bg-destructive",
};

export function ContinuationCard({ breakdown }: { breakdown: ContinuationBreakdown }) {
  const t = useTranslations("growth.retentionChurn.continuation");
  const { counts, total } = breakdown;
  return (
    <section className={CARD}>
      <CardHeader title={t("title")} def={t("def", { days: RECENT_OUTCOME_DAYS, window: RENEWAL_WINDOW_DAYS })} />
      {total === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t("noData")}</p>
      ) : (
        <div className="space-y-3">
          <div className="flex h-4 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label={t("title")}>
            {CONTINUATION_STATUSES.map((s) =>
              counts[s] ? <span key={s} className={STATUS_BG[s]} style={{ width: `${(counts[s] / total) * 100}%` }} title={`${t(`statuses.${s}`)}: ${counts[s]}`} /> : null
            )}
          </div>
          <ul className="grid grid-cols-1 gap-1.5 text-sm sm:grid-cols-2">
            {CONTINUATION_STATUSES.map((s) => (
              <li key={s} className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5">
                  <Swatch className={STATUS_BG[s]} />
                  {t(`statuses.${s}`)}
                </span>
                <span className="tabular-nums">{counts[s]}</span>
              </li>
            ))}
          </ul>
          {breakdown.churnedStillActive > 0 ? (
            <Link
              href="/growth/customers?tab=renewals&bucket=expiredActive"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              {t("stillActive", { count: breakdown.churnedStillActive })}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          ) : null}
        </div>
      )}
    </section>
  );
}
