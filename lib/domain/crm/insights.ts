/**
 * CRM içgörüleri (DeepSportAdmin lib/domain/crm/insights.ts'ten) — saf fonksiyonlar:
 * - leadFunnel (G82): aday → demo → satış süreci → aktif müşteri
 * - findDuplicateGroups (G60): normalize e-posta / telefon / ad eşleşmeleri (adaylar + adaya bağlı olmayan kurumlar)
 *
 * Taşınmayanlar: `leadToUpdateRequest` (PATCH kısmi güncellemedir, tam gövde gerekmez) ve lead skoru
 * (G105; ilgi yarısı antrenörün son giriş/test verisine dayanıyordu, CRM'de karşılığı yok).
 */

import { normalizeEmail, normalizeTrPhone } from "@/lib/utils/phone";
import type { CrmLead } from "./types";

// --- Satış hunisi (G82) ---

export type FunnelStageKey = "lead" | "demo" | "inProgress" | "customer";
export const FUNNEL_STAGES: FunnelStageKey[] = ["lead", "demo", "inProgress", "customer"];

export interface FunnelStep {
  key: FunnelStageKey;
  count: number;
  /** Bir önceki adıma göre %; ilk adımda null. */
  stepRate: number | null;
  /** İlk adıma (tüm adaylar) göre %. */
  overallRate: number | null;
}

/**
 * Aşama geçmişi tutulmadığı için ulaşılan en ileri aşama bugünkü statüden okunur; ileri aşamadaki aday
 * önceki aşamaları geçmiş sayılır. Bir Edoras kurumuna bağlı aday (demo açılmış ya da hesabı olan)
 * en az demo aşamasındadır.
 */
export function funnelRank(lead: CrmLead): number {
  switch (lead.status) {
    case "SATIS_OLDU":
      return 3;
    case "TEKLIF_VERILDI":
    case "RANDEVU_PLANLANDI":
      return 2;
    case "DEMO_TANIMLANDI":
      return 1;
    default:
      return lead.institutionId ? 1 : 0;
  }
}

const pct = (a: number, b: number): number | null => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

export function leadFunnel(leads: CrmLead[]): FunnelStep[] {
  const counts = [0, 0, 0, 0];
  for (const lead of leads) {
    const r = funnelRank(lead);
    for (let i = 0; i <= r; i++) counts[i]++;
  }
  return FUNNEL_STAGES.map((key, i) => ({
    key,
    count: counts[i],
    stepRate: i === 0 ? null : pct(counts[i], counts[i - 1]),
    overallRate: i === 0 ? null : pct(counts[i], counts[0]),
  }));
}

// --- Mükerrer tespiti (G60) ---

/** Adaya bağlı olmayan Edoras kurumu (DeepSport'taki "yeni kullanıcı" karşılığı). */
export interface DupInstitution {
  id: string;
  name: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  createdAt?: string | number | null;
}

export type DupRecord = { kind: "lead"; lead: CrmLead } | { kind: "institution"; institution: DupInstitution };
export type DupReason = "email" | "phone" | "organization" | "name";

export interface DupGroup {
  records: DupRecord[];
  reasons: DupReason[];
  /** E-posta / telefon eşleşiyorsa yüksek, yalnızca ad eşleşiyorsa orta. */
  confidence: "high" | "medium";
}

const TR_FOLD: Record<string, string> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };

/** Küçük harf, Türkçe karakter katlama, harf/rakam dışını at. */
export function normalizeName(input: string | null | undefined): string {
  return (input ?? "")
    .toLocaleLowerCase("tr")
    .replace(/[çğıöşüâîû]/g, (c) => TR_FOLD[c] ?? c)
    .replace(/[^a-z0-9]/g, "");
}

function keysFor(r: DupRecord): [DupReason, string][] {
  const out: [DupReason, string][] = [];
  const add = (reason: DupReason, value: string | null | undefined, min = 1) => {
    if (value && value.length >= min) out.push([reason, value]);
  };
  if (r.kind === "lead") {
    const l = r.lead;
    add("email", normalizeEmail(l.contactEmail));
    add("phone", normalizeTrPhone(l.contactPhone));
    add("organization", normalizeName(l.organizationName), 5);
    if (l.contactFirstName?.trim() && l.contactLastName?.trim()) {
      add("name", normalizeName(`${l.contactFirstName}${l.contactLastName}`), 6);
    }
  } else {
    const i = r.institution;
    add("email", normalizeEmail(i.email));
    add("phone", normalizeTrPhone(i.phone));
    add("organization", normalizeName(i.name), 5);
    if (i.contactName?.trim().includes(" ")) add("name", normalizeName(i.contactName), 6);
  }
  return out;
}

const STRONG: DupReason[] = ["email", "phone"];

/**
 * Adaylar (ve isteğe bağlı kurumlar) arasında ortak anahtar paylaşanları gruplar. Bir adaya zaten
 * bağlı kurumlar atlanır (bu bağlantıdır, mükerrer değil). Birleştirme yapmaz; yalnızca öneri üretir.
 */
export function findDuplicateGroups(leads: CrmLead[], institutions: DupInstitution[] = []): DupGroup[] {
  const linked = new Set(leads.map((l) => l.institutionId).filter(Boolean));
  const records: DupRecord[] = [
    ...leads.map((lead) => ({ kind: "lead" as const, lead })),
    ...institutions.filter((i) => !linked.has(i.id)).map((institution) => ({ kind: "institution" as const, institution })),
  ];

  const parent = records.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const firstByKey = new Map<string, number>();
  const hitKeys: [number, DupReason][] = [];

  records.forEach((r, i) => {
    for (const [reason, value] of keysFor(r)) {
      const key = `${reason}:${value}`;
      const j = firstByKey.get(key);
      if (j == null) {
        firstByKey.set(key, i);
        continue;
      }
      parent[find(i)] = find(j);
      hitKeys.push([i, reason]);
    }
  });

  const groups = new Map<number, { idx: number[]; reasons: Set<DupReason> }>();
  records.forEach((_, i) => {
    const root = find(i);
    const g = groups.get(root) ?? { idx: [], reasons: new Set<DupReason>() };
    g.idx.push(i);
    groups.set(root, g);
  });
  for (const [i, reason] of hitKeys) groups.get(find(i))!.reasons.add(reason);

  const out: DupGroup[] = [];
  for (const g of groups.values()) {
    if (g.idx.length < 2) continue;
    const recs = g.idx.map((i) => records[i]);
    if (!recs.some((r) => r.kind === "lead")) continue;
    const reasons = [...g.reasons];
    out.push({
      records: recs,
      reasons,
      confidence: reasons.some((r) => STRONG.includes(r)) ? "high" : "medium",
    });
  }
  return out.sort(
    (a, b) =>
      (a.confidence === b.confidence ? 0 : a.confidence === "high" ? -1 : 1) || b.records.length - a.records.length
  );
}
