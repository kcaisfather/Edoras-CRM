/**
 * Kurum başına maliyet ve marj (DeepSport "Kullanıcı maliyeti + kâr/zarar"ın Edoras karşılığı). Saf; testler
 * allocation.test.ts.
 *
 *  - Ortak maliyet (Supabase, Vercel, OpenAI, Resend, alan adı, diğer; SMS hariç) kurumlar arasında AKTİF ÖĞRENCİ sayısıyla
 *    paylaştırılır. Öğrencisi olmayan kurum pay almaz; hiç öğrenci yoksa maliyet "dağıtılmamış" kalır.
 *  - SMS doğrudan kuruma yazılır: deftere o ay SMS satırı girilmişse gerçek tutar alıcı payıyla bölünür; girilmemişse
 *    alıcı × birim fiyat (tahmin). Edoras'ta SMS kaydı yoksa SMS'in tamamı ortak havuza katılır (kuruma atfedilemez).
 *  - Gelir: o aya düşen lisans bedeli (12 aya yayılmış). Demo ve bedelsiz lisans geliri 0'dır → marj "gelirsiz".
 *  - Marj = gelir − maliyet; yüzde = marj / gelir. Sağlıklı ≥ %30, sınırda 0–%30, zarar < 0.
 */
import type { InstitutionCostRow, InstitutionCostsResponse, MarginState } from "./types";

export const HEALTHY_MARGIN_PCT = 30;

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface AllocationInstitution {
  id: string;
  name: string;
  /** Aktif dönemde sınıfa kayıtlı öğrenci; yoksa toplam öğrenci. */
  students: number;
  revenueTry: number;
  status: string | null;
}

export interface AllocationInput {
  month: string;
  institutions: readonly AllocationInstitution[];
  /** SMS dışı ortak maliyetler (TL). */
  sharedPoolTry: number;
  /** Deftere girilmiş SMS (TL) — 0 ise girilmemiş. */
  smsLedgerTry: number;
  /** Kurum → o aydaki SMS alıcı sayısı; null = Edoras okunamadı. */
  smsRecipients: ReadonlyMap<string, number> | null;
  smsUnitPriceTry: number;
}

export function marginState(revenue: number, margin: number): MarginState {
  if (revenue <= 0) return "NO_REVENUE";
  if (margin < 0) return "LOSS";
  return (margin / revenue) * 100 >= HEALTHY_MARGIN_PCT ? "HEALTHY" : "TIGHT";
}

/** `total`'i ağırlıklara göre kuruşa yuvarlayarak böler; kuruş farkı en büyük paya eklenir (toplam korunur). */
export function splitByWeight(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (sum <= 0 || total === 0) return weights.map(() => 0);
  const parts = weights.map((w) => round2((total * w) / sum));
  const diff = round2(total - parts.reduce((s, p) => s + p, 0));
  if (diff !== 0) {
    let max = 0;
    weights.forEach((w, i) => {
      if (w > weights[max]) max = i;
    });
    parts[max] = round2(parts[max] + diff);
  }
  return parts;
}

export function allocateInstitutionCosts(input: AllocationInput): InstitutionCostsResponse {
  const { institutions, smsRecipients } = input;
  const recipients = institutions.map((i) => smsRecipients?.get(i.id) ?? 0);
  const totalRecipients = recipients.reduce((s, r) => s + r, 0);
  const smsAvailable = smsRecipients !== null;

  let smsMode: InstitutionCostsResponse["smsMode"] = "NONE";
  let smsTotal = 0;
  if (smsAvailable && totalRecipients > 0) {
    if (input.smsLedgerTry > 0) {
      smsMode = "LEDGER";
      smsTotal = input.smsLedgerTry;
    } else if (input.smsUnitPriceTry > 0) {
      smsMode = "ESTIMATE";
      smsTotal = round2(totalRecipients * input.smsUnitPriceTry);
    }
  }
  const smsParts = smsMode === "NONE" ? recipients.map(() => 0) : splitByWeight(smsTotal, recipients);

  // Kuruma atfedilemeyen SMS (Edoras okunamadı / alıcı yok) ortak havuza katılır.
  const pool = round2(input.sharedPoolTry + (smsMode === "NONE" ? input.smsLedgerTry : 0));
  const students = institutions.map((i) => Math.max(0, i.students));
  const totalStudents = students.reduce((s, n) => s + n, 0);
  const sharedParts = totalStudents > 0 ? splitByWeight(pool, students) : students.map(() => 0);
  const unallocated = totalStudents > 0 ? 0 : pool;

  const items: InstitutionCostRow[] = institutions.map((inst, i) => {
    const totalCost = round2(sharedParts[i] + smsParts[i]);
    const margin = round2(inst.revenueTry - totalCost);
    return {
      id: inst.id,
      name: inst.name,
      students: students[i],
      sharedCostTry: sharedParts[i],
      smsCostTry: smsParts[i],
      totalCostTry: totalCost,
      revenueTry: round2(inst.revenueTry),
      marginTry: margin,
      marginPct: inst.revenueTry > 0 ? (margin / inst.revenueTry) * 100 : null,
      costPerStudentTry: students[i] > 0 ? round2(totalCost / students[i]) : null,
      margin: marginState(inst.revenueTry, margin),
      status: inst.status,
    };
  });

  return {
    month: input.month,
    sharedPoolTry: pool,
    smsMode,
    smsTotalTry: smsTotal,
    smsAvailable,
    totalCostTry: round2(items.reduce((s, r) => s + r.totalCostTry, 0)),
    totalRevenueTry: round2(items.reduce((s, r) => s + r.revenueTry, 0)),
    items,
    unallocatedTry: unallocated,
  };
}
