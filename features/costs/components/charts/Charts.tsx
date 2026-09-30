"use client";

import { useTranslations } from "next-intl";
import { COST_SERVICES, type CostService, type TrendPoint } from "@/lib/domain/costs/types";
import { SERVICE_COLORS, formatCompactLira, formatLira, formatMonthShort } from "../shared/format";

/**
 * Grafikler kütüphanesiz (SVG): DeepSport'un recharts sürümündeki aynı görünümler — 12 aylık yığılmış sütun eğilimi ve hizmet payı
 * halkası. Renkler tema değişkenlerinden; her parça yerel ipucu (<title>) taşır, grafik ekran okuyucuya özetle okunur.
 */

const W = 640;
const H = 240;
const PAD = { top: 12, right: 8, bottom: 26, left: 48 };

/** 1, 2, 5 × 10^n adımlı düzgün üst sınır. */
function niceMax(value: number): number {
  if (value <= 0) return 1;
  const exp = Math.floor(Math.log10(value));
  const base = 10 ** exp;
  const f = value / base;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * base;
}

export function TrendBars({ points, services }: { points: TrendPoint[]; services?: readonly CostService[] }) {
  const t = useTranslations("costs");
  const shown = services ?? COST_SERVICES;
  const max = niceMax(Math.max(...points.map((p) => p.totalTry), 0));
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const slot = innerW / Math.max(points.length, 1);
  const barW = Math.min(36, slot * 0.62);
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const ticks = [0, 0.5, 1].map((f) => f * max);
  const summary = t("charts.trendSummary", { months: points.length, max: formatLira(Math.max(...points.map((p) => p.totalTry), 0)) });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={summary}>
      <title>{summary}</title>
      {ticks.map((tick) => (
        <g key={tick}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} stroke="hsl(var(--border))" strokeDasharray={tick === 0 ? undefined : "3 4"} />
          <text x={PAD.left - 6} y={y(tick) + 4} textAnchor="end" fontSize="10" fill="hsl(var(--muted-foreground))">
            {formatCompactLira(tick)}
          </text>
        </g>
      ))}
      {points.map((p, i) => {
        const x = PAD.left + slot * i + (slot - barW) / 2;
        let acc = 0;
        return (
          <g key={p.month}>
            {shown.map((service) => {
              const v = p.byService[service] ?? 0;
              if (v <= 0) return null;
              const top = y(acc + v);
              const h = y(acc) - top;
              acc += v;
              return (
                <rect key={service} x={x} y={top} width={barW} height={Math.max(h, 0.5)} fill={SERVICE_COLORS[service]} rx={2}>
                  <title>{`${formatMonthShort(p.month)} · ${t(`services.names.${service}`)}: ${formatLira(v)}`}</title>
                </rect>
              );
            })}
            <text x={x + barW / 2} y={H - 8} textAnchor="middle" fontSize="10" fill="hsl(var(--muted-foreground))">
              {formatMonthShort(p.month)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  color: string;
}

/** Halka grafiği: parçalar `stroke-dasharray` ile çizilir; ortada toplam. */
export function ServiceDonut({ data, centerLabel, centerValue, size = 200 }: { data: DonutSlice[]; centerLabel?: string; centerValue?: string; size?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const radius = 42;
  const circ = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={data.map((d) => `${d.label}: ${formatLira(d.value)}`).join(", ")}>
        <circle cx="50" cy="50" r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth="12" />
        {total > 0
          ? data.map((d) => {
              const len = (d.value / total) * circ;
              const el = (
                <circle
                  key={d.key}
                  cx="50"
                  cy="50"
                  r={radius}
                  fill="none"
                  stroke={d.color}
                  strokeWidth="12"
                  strokeDasharray={`${Math.max(len - 0.8, 0)} ${circ - Math.max(len - 0.8, 0)}`}
                  strokeDashoffset={-offset}
                  transform="rotate(-90 50 50)"
                >
                  <title>{`${d.label}: ${formatLira(d.value)}`}</title>
                </circle>
              );
              offset += len;
              return el;
            })
          : null}
      </svg>
      {centerLabel || centerValue ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          {centerLabel ? <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{centerLabel}</span> : null}
          {centerValue ? <span className="text-illuminated mt-1 text-2xl font-light text-foreground">{centerValue}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

/** Tek satırlık pay çubuğu (Hizmetler tablosu). */
export function ShareBar({ pct, color }: { pct: number; color?: string }) {
  return (
    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, pct))}%`, backgroundColor: color ?? "hsl(var(--primary))" }} />
    </div>
  );
}
