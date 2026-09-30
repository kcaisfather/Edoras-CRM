/**
 * Rapor e-postası ve önizleme metni — saf fonksiyon (testler render.test.ts). Aynı bölüm verisinden düz metin ve HTML
 * üretilir; tutar yalnız satırda `amount` doluysa yazılır (süzme lib/domain/reports/build.ts'te yapılır).
 */
import { formatCurrency } from "@/lib/domain/crm/utils";
import type { ReportFrequency, ReportLine, ReportSectionData } from "./types";

export const FREQUENCY_LABELS: Record<ReportFrequency, string> = { DAILY: "Günlük", WEEKLY: "Haftalık", MONTHLY: "Aylık" };
export const PERIOD_LABELS: Record<ReportFrequency, string> = { DAILY: "son 1 gün", WEEKLY: "son 7 gün", MONTHLY: "son 30 gün" };

export function periodLabel(frequency: ReportFrequency): string {
  return PERIOD_LABELS[frequency];
}

const dateFormat = new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "long", year: "numeric" });

export function reportHeading(frequency: ReportFrequency, now: Date): string {
  return `Edoras CRM raporu — ${dateFormat.format(now)} (${FREQUENCY_LABELS[frequency]})`;
}

export function reportSubject(frequency: ReportFrequency, now: Date): string {
  return `Edoras CRM raporu · ${dateFormat.format(now)} · ${FREQUENCY_LABELS[frequency]}`;
}

function lineExtras(l: ReportLine): string {
  return [l.detail, l.amount != null ? formatCurrency(l.amount) : null].filter(Boolean).join(" · ");
}

function sectionHeadline(s: ReportSectionData): string {
  return `${s.title}: ${s.count}${s.total != null ? ` · ${formatCurrency(s.total)}` : ""}`;
}

export function renderReportText(sections: readonly ReportSectionData[], frequency: ReportFrequency, now: Date, appUrl?: string | null): string {
  const out = [reportHeading(frequency, now), `Dönem: ${periodLabel(frequency)}`];
  if (sections.length === 0) out.push("", "Bu rapor için gösterilecek bölüm yok.");
  for (const s of sections) {
    out.push("", `• ${sectionHeadline(s)}`);
    if (s.count === 0) out.push("   Kayıt yok.");
    for (const l of s.lines) {
      const extras = lineExtras(l);
      out.push(`   - ${l.name}${extras ? ` (${extras})` : ""}`);
    }
    if (s.more > 0) out.push(`   +${s.more} kayıt daha`);
  }
  if (appUrl) out.push("", `Paneli aç: ${appUrl}`);
  return out.join("\n");
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (v: string): string => v.replace(/[&<>"']/g, (c) => ESCAPES[c]);

/** Yalnız http(s) adresi bağlantı olur (e-postada javascript: vb. olmasın). */
const safeUrl = (u: string | null | undefined): string | null => (u && /^https?:\/\//i.test(u) ? u : null);

export function renderReportHtml(sections: readonly ReportSectionData[], frequency: ReportFrequency, now: Date, appUrl?: string | null): string {
  const url = safeUrl(appUrl);
  const body = sections
    .map((s) => {
      const items = s.lines
        .map((l) => {
          const extras = lineExtras(l);
          return `<li style="margin:2px 0">${escapeHtml(l.name)}${extras ? ` <span style="color:#6b7280">(${escapeHtml(extras)})</span>` : ""}</li>`;
        })
        .join("");
      const more = s.more > 0 ? `<li style="margin:2px 0;color:#6b7280;list-style:none">+${s.more} kayıt daha</li>` : "";
      const empty = s.count === 0 ? `<p style="margin:4px 0;color:#6b7280">Kayıt yok.</p>` : "";
      return (
        `<h3 style="margin:18px 0 4px;font-size:15px">${escapeHtml(s.title)}: <span style="font-weight:700">${s.count}</span>` +
        `${s.total != null ? ` <span style="color:#6b7280;font-weight:400">· ${escapeHtml(formatCurrency(s.total))}</span>` : ""}</h3>` +
        `${empty}<ul style="margin:4px 0;padding-left:20px">${items}${more}</ul>`
      );
    })
    .join("");
  const none = sections.length === 0 ? `<p style="color:#6b7280">Bu rapor için gösterilecek bölüm yok.</p>` : "";
  const link = url ? `<p style="margin-top:24px"><a href="${escapeHtml(url)}" style="color:#2563eb">Paneli aç</a></p>` : "";
  return (
    `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:14px;line-height:1.5;color:#111827;max-width:640px">` +
    `<h2 style="margin:0 0 4px;font-size:18px">${escapeHtml(reportHeading(frequency, now))}</h2>` +
    `<p style="margin:0;color:#6b7280">Dönem: ${escapeHtml(periodLabel(frequency))}</p>` +
    `${none}${body}${link}` +
    `<p style="margin-top:24px;font-size:12px;color:#9ca3af">Bu e-posta Edoras CRM ekibine gönderilen zamanlanmış rapordur. Ayarlar → Raporlar bölümünden yönetilir.</p>` +
    `</div>`
  );
}
