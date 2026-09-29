/**
 * Madde 12 — takip kuralları (DeepSportAdmin lib/domain/crm/rules.ts'ten, Edoras kural setine uyarlandı).
 * Kurallar crm_rules tablosunda (supabase/migrations/20260929170000_crm_tasks.sql); varsayılanlar orada
 * da yazılıdır ve bu dosyayla AYNI tutulur. Saf veri + doğrulama.
 *
 * Edoras'ta demo da lisans da 1 yıldır; 1 haftalık demo, paket ve kontenjan yoktur. DeepSport'tan eşleme:
 *   demoShort + demoLong → demoEnding (demo bitişine N gün kala)
 *   expiredActive        → expired (demo ya da lisans bitti, dönüşmedi / yenilenmedi; kullanım sinyali yok)
 *   quotaHigh            → kaldırıldı (kontenjan yok)
 * Anket kuralı (surveyNoResponse) Anketler modülüyle görev üretir: gönderilmiş / açılmış, yanıtsız davet → gönderimden
 * N gün sonra adayda "Anket araması" (lib/domain/tasks/derive.ts). Soğuk liste kuralı (coldList) soğuk listeler
 * modülüyle görev üretir (lib/domain/tasks/cold.ts).
 */

import type { CrmStatus } from "@/lib/domain/crm/types";

export const TASK_KINDS = [
  "scheduled",
  "offer",
  "demoEnding",
  "annualRenewal",
  "expired",
  "balance",
  "lostRecontact",
  "undatedFollowUp",
  "surveyNoResponse",
  "coldList",
] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

export function isTaskKind(value: unknown): value is TaskKind {
  return typeof value === "string" && (TASK_KINDS as readonly string[]).includes(value);
}

export interface RuleConfig {
  id: TaskKind;
  enabled: boolean;
  /** Gün: "+N gün" ya da "bitişe N gün kala". Alan adı DeepSport uç sözleşmesiyle aynı. */
  days: number;
}

export const MAX_RULE_DAYS = 365;

/** Gün parametresi olmayan kurallar (elle planlanan arama tarihi). */
export const RULES_WITHOUT_DAYS: TaskKind[] = ["scheduled"];

/**
 * Veri kaynağı henüz taşınmamış kurallar — ayarlanabilir ama görev üretmez (DeepSport RULES_NEEDING_BACKEND).
 * Değer: bekledikleri modül (metin anahtarı: crm.rules.needsModule.<değer>). Anketler ve soğuk listeler taşındı; şu an boş.
 */
export const RULES_NEEDING_MODULE: Partial<Record<TaskKind, string>> = {};

/**
 * Öznesi KURUM olan kurallar (crm_institutions / crm_licenses). Görev anahtarı kuruma bağlıdır: kuruma sonradan
 * aday bağlansa da tamamlanma kaydı korunur. Ekranda "müşteri" bağlı aday varsa aday, yoksa kurumdur.
 */
export const INSTITUTION_RULES: readonly TaskKind[] = ["demoEnding", "annualRenewal", "expired"];

export const isInstitutionRule = (kind: string): boolean => (INSTITUTION_RULES as readonly string[]).includes(kind);

export const DEFAULT_RULES: RuleConfig[] = [
  { id: "scheduled", enabled: true, days: 0 },
  { id: "offer", enabled: true, days: 3 },
  // Demo 1 yıl: bitişine 30 gün kala ara.
  { id: "demoEnding", enabled: true, days: 30 },
  // Yıllık lisans bitişine 60 gün kala ara.
  { id: "annualRenewal", enabled: true, days: 60 },
  // Demo ya da lisans bitti, ücretliye geçmedi / yenilenmedi: bitişten N gün sonra ara (0 = bitiş günü).
  { id: "expired", enabled: true, days: 0 },
  // Açık bakiye (satış − tahsilat > 0): son güncelleme ya da son tahsilattan N gün sonra tahsilat araması.
  { id: "balance", enabled: true, days: 7 },
  { id: "lostRecontact", enabled: true, days: 90 },
  // Tarihsiz "Aranacak" / "Takipte": son güncellemeden N gün sonra ara.
  { id: "undatedFollowUp", enabled: true, days: 0 },
  { id: "surveyNoResponse", enabled: true, days: 5 },
  // Soğuk liste: aranmamış kişi bugün, ulaşılamayan kişi son denemeden N gün sonra.
  { id: "coldList", enabled: true, days: 2 },
];

/** Kural parametresinin geçerli aralığı (gün: 0–365; SQL: crm_rules_days_check). */
export function ruleParamRange(_id: TaskKind): { min: number; max: number } {
  return { min: 0, max: MAX_RULE_DAYS };
}

function clampDays(id: TaskKind, n: unknown, fallback: number): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return fallback;
  const { min, max } = ruleParamRange(id);
  return Math.min(max, Math.max(min, Math.round(v)));
}

/**
 * Saklanan (ya da uçtan gelen) kural listesini doğrular: bilinmeyen kurallar atılır, eksikler varsayılanla
 * tamamlanır, sıra her zaman DEFAULT_RULES sırasıdır.
 */
export function normalizeRules(input: unknown): RuleConfig[] {
  const list = Array.isArray(input) ? input : [];
  const byId = new Map<string, Record<string, unknown>>();
  for (const item of list) {
    if (item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string") {
      byId.set((item as { id: string }).id, item as Record<string, unknown>);
    }
  }
  return DEFAULT_RULES.map((def) => {
    const raw = byId.get(def.id);
    if (!raw) return { ...def };
    return {
      id: def.id,
      enabled: typeof raw.enabled === "boolean" ? raw.enabled : def.enabled,
      days: RULES_WITHOUT_DAYS.includes(def.id) ? 0 : clampDays(def.id, raw.days, def.days),
    };
  });
}

export function ruleMap(rules: RuleConfig[]): Record<TaskKind, RuleConfig> {
  const out = {} as Record<TaskKind, RuleConfig>;
  for (const r of normalizeRules(rules)) out[r.id] = r;
  return out;
}

export function isDefaultRules(rules: RuleConfig[]): boolean {
  const n = normalizeRules(rules);
  return DEFAULT_RULES.every((d, i) => n[i].enabled === d.enabled && n[i].days === d.days);
}

/** Değişen kurallar ("offer.days 3→5", "balance.enabled true→false") — işlem kaydı özeti. */
export function describeRuleChanges(before: RuleConfig[], after: RuleConfig[]): string[] {
  const prev = ruleMap(before);
  const out: string[] = [];
  for (const r of normalizeRules(after)) {
    const p = prev[r.id];
    if (p.enabled !== r.enabled) out.push(`${r.id}.enabled ${p.enabled}→${r.enabled}`);
    if (p.days !== r.days) out.push(`${r.id}.days ${p.days}→${r.days}`);
  }
  return out;
}

/**
 * Statü seçilince önerilen sonraki arama (bugünden +gün): Teklif verildi → "offer", Satış olmadı →
 * "lostRecontact" kuralının günü (DeepSport CrmEditModal). Kural kapalıysa öneri yok.
 */
export function followUpSuggestDays(rules: RuleConfig[]): Partial<Record<CrmStatus, number>> {
  const r = ruleMap(rules);
  const out: Partial<Record<CrmStatus, number>> = {};
  if (r.offer.enabled) out.TEKLIF_VERILDI = r.offer.days;
  if (r.lostRecontact.enabled) out.OLUMSUZ = r.lostRecontact.days;
  return out;
}
