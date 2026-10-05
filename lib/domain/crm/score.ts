/**
 * Lead skoru (0–100) — adayın "satışa yakınlığı" için kurala dayalı, açıklanabilir puan. Saf; testler score.test.ts.
 * Yalnız aday kaydındaki alanlardan hesaplanır (tutar kullanılmaz: CRM_AGENT de aynı skoru görür). Her puanın nedeni
 * `parts`'ta döner (arayüzde ipucu olarak gösterilir). Ağırlıklar aşağıdaki tek yerdedir; toplam en çok 100.
 *
 *   Aşama 40 · Tazelik 20 · Takip 10 · İletişim bilgisi 15 · Kaynak 10 · Kuruma bağlı 5   (şikâyet kaydı −10)
 *
 * Satışı yapılmış (SATIS_OLDU) ve "Satış olmadı" (OLUMSUZ) adaylar puanlanmaz (null): öncelik sıralaması açık fırsatlar içindir.
 */
import { todayIso } from "@/lib/domain/institutions/rules";
import type { CrmLead, CrmStatus, LeadSource } from "./types";

export const SCORE_TIERS = ["hot", "warm", "cold"] as const;
export type ScoreTier = (typeof SCORE_TIERS)[number];

/** Sıcak ≥ 70, ılık 40–69, soğuk < 40. */
export const HOT_MIN = 70;
export const WARM_MIN = 40;

export const SCORE_PART_KEYS = ["stage", "freshness", "followUp", "contact", "source", "linked", "complaint"] as const;
export type ScorePartKey = (typeof SCORE_PART_KEYS)[number];

/** Aşamaya göre puan (açık statüler). */
export const STAGE_POINTS: Partial<Record<CrmStatus, number>> = {
  ARANACAK: 10,
  ULASILAMADI: 8,
  TAKIPTE: 20,
  RANDEVU_PLANLANDI: 30,
  DEMO_TANIMLANDI: 35,
  TEKLIF_VERILDI: 40,
};

/** Kaynağa göre puan: Edoras'ta kendi kaydolan kurum en sıcak, soğuk liste en soğuk. */
export const SOURCE_POINTS: Record<LeadSource, number> = { EDORAS: 10, MANUAL: 6, IMPORT: 4, COLD_LIST: 3 };

export interface ScorePart {
  key: ScorePartKey;
  points: number;
}

export interface LeadScore {
  /** 0–100, tam sayı. */
  score: number;
  tier: ScoreTier;
  parts: ScorePart[];
  /** Sonraki arama günü geçmiş — skordan bağımsız "aksiyon gerek" işareti. */
  followUpOverdue: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Son güncellemeden bu yana gün → tazelik puanı (en çok 20). */
export function freshnessPoints(daysSinceUpdate: number | null): number {
  if (daysSinceUpdate == null) return 1;
  if (daysSinceUpdate <= 3) return 20;
  if (daysSinceUpdate <= 7) return 16;
  if (daysSinceUpdate <= 14) return 11;
  if (daysSinceUpdate <= 30) return 6;
  return 1;
}

export function tierOf(score: number): ScoreTier {
  return score >= HOT_MIN ? "hot" : score >= WARM_MIN ? "warm" : "cold";
}

/** Adayın skoru; satışı yapılmış / olumsuz ya da statüsüz aday için null. */
export function leadScore(lead: CrmLead, now: Date = new Date()): LeadScore | null {
  const stage = lead.status ? STAGE_POINTS[lead.status] : undefined;
  if (stage == null) return null;

  const today = todayIso(now);
  const days = lead.updatedAt != null ? Math.max(0, Math.floor((now.getTime() - lead.updatedAt) / DAY_MS)) : null;
  const followUpOverdue = !!lead.nextFollowUpAt && lead.nextFollowUpAt < today;

  const parts: ScorePart[] = [
    { key: "stage", points: stage },
    { key: "freshness", points: freshnessPoints(days) },
    { key: "followUp", points: lead.nextFollowUpAt && !followUpOverdue ? 10 : 0 },
    { key: "contact", points: (lead.contactEmail ? 7 : 0) + (lead.contactPhone ? 8 : 0) },
    { key: "source", points: lead.source ? SOURCE_POINTS[lead.source] : 0 },
    { key: "linked", points: lead.institutionId ? 5 : 0 },
  ];
  // Çözülmemiş şikâyet puanı düşürür.
  if (lead.dissatisfaction && lead.dissatisfaction.status !== "cozuldu") parts.push({ key: "complaint", points: -10 });

  const score = Math.max(0, Math.min(100, parts.reduce((s, p) => s + p.points, 0)));
  return { score, tier: tierOf(score), parts, followUpOverdue };
}
