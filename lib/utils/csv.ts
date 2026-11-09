/** Ekrandaki listenin CSV'si (Excel TR için ";" ayraç + UTF-8 BOM) — Büyüme listeleri ve haftalık tablo. */

export type CsvCell = string | number | null | undefined;

/**
 * Formül enjeksiyonu (OWASP CSV Injection): `=`, `+`, `-`, `@`, sekme ya da satır başıyla başlayan metin Excel'de
 * formül olarak çalışır → başına `'` eklenir. Sayılar ve sayı / telefon gibi görünen metin ("-12,50",
 * "+90 533 000 00 02") olduğu gibi kalır.
 */
const FORMULA_START = /^[=+\-@\t\r]/;
const NUMERIC_TEXT = /^[-+]?\d[\d\s().,]*$/;

function escapeCell(v: CsvCell): string {
  if (v == null) return "";
  let s = String(v);
  if (typeof v === "string" && FORMULA_START.test(s) && !NUMERIC_TEXT.test(s)) s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: CsvCell[][]): string {
  return [header, ...rows].map((r) => r.map(escapeCell).join(";")).join("\r\n");
}

export function downloadCsv(filename: string, header: string[], rows: CsvCell[][]): void {
  const blob = new Blob(["﻿" + toCsv(header, rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}-${csvDate(Date.now())}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** CSV'de tarih: yerel gün (YYYY-MM-DD). */
export function csvDate(ms: number | null | undefined): string {
  if (ms == null) return "";
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Sütun indekslerini (ör. tutar kolonları, CRM_AGENT için) başlık ve satırlardan çıkarır. */
export function dropColumns(header: string[], rows: CsvCell[][], drop: readonly number[]): [string[], CsvCell[][]] {
  if (drop.length === 0) return [header, rows];
  const keep = (_: unknown, i: number) => !drop.includes(i);
  return [header.filter(keep), rows.map((r) => r.filter(keep))];
}
