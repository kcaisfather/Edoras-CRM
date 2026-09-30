/**
 * Maliyetler alan tipleri (DeepSport features/costs/types.ts'in Edoras karşılığı).
 *
 * DeepSport'ta maliyet bir AWS maliyet servisinden (Cost Explorer / CUR) geliyordu; burada CRM'in kendi maliyet defteri
 * (crm_cost_entries — elle ya da CSV) var. Tüm tutarlar TL'ye çevrilmiş (`amountTry`) gösterilir; USD satırları girişte
 * kurla (TL / USD) çevrilir. Ay anahtarı her yerde "YYYY-MM"dir.
 */

export const COST_SERVICES = ["SUPABASE", "VERCEL", "SMS", "OPENAI", "RESEND", "DOMAIN", "OTHER"] as const;
export type CostService = (typeof COST_SERVICES)[number];

export const COST_CURRENCIES = ["TRY", "USD"] as const;
export type CostCurrency = (typeof COST_CURRENCIES)[number];

export const COST_SOURCES = ["MANUAL", "IMPORT"] as const;
export type CostSource = (typeof COST_SOURCES)[number];

/**
 * Kullanıma göre değişen hizmetler: ay ortasında ay sonu "hız" (aya oranla) ile tahmin edilir. Diğerleri (Supabase planı, Vercel,
 * Resend planı, alan adı…) sabit aylık kalem sayılır: ay sonu tahmini = max(bu ay girilen, geçen ay) — sabit bir kalemi
 * ayın 2'sinde girip "hızla" 15 katına çıkarmamak için.
 */
export const USAGE_BASED_SERVICES: readonly CostService[] = ["SMS", "OPENAI"];

export interface CostEntry {
  id: string;
  service: CostService;
  /** YYYY-MM */
  month: string;
  amount: number;
  currency: CostCurrency;
  /** TL / USD; yalnız USD satırlarında. */
  fxRate: number | null;
  /** TL karşılığı (veritabanında üretilmiş sütun). */
  amountTry: number;
  note: string | null;
  source: CostSource;
  createdByName: string | null;
  createdAt: string;
}

export interface CostEntryList {
  items: CostEntry[];
  total: number;
  /** Süzgece uyan tüm satırların TL toplamı. */
  totalTry: number;
  page: number;
  size: number;
}

export const BUDGET_SCOPES = ["GLOBAL", "SERVICE"] as const;
export type BudgetScope = (typeof BUDGET_SCOPES)[number];

export interface CostBudget {
  id: string;
  scope: BudgetScope;
  service: CostService | null;
  monthlyLimitTry: number;
  softPct: number;
  hardPct: number;
  active: boolean;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export type BudgetState = "OK" | "SOFT_BREACH" | "HARD_BREACH" | "PROJECTED_OVERRUN";

/** Bir bütçenin içinde bulunulan aydaki durumu (okuma anında hesaplanır). */
export interface BudgetStatus {
  budgetId: string;
  scope: BudgetScope;
  service: CostService | null;
  active: boolean;
  monthlyLimitTry: number;
  softPct: number;
  hardPct: number;
  spentTry: number;
  forecastTry: number;
  usagePct: number;
  projectedOverrunTry: number;
  state: BudgetState;
}

export type CostAlertType = "BUDGET_SOFT" | "BUDGET_HARD" | "BUDGET_PROJECTED" | "SPIKE";
export type CostAlertSeverity = "WARN" | "CRITICAL";

/** Hesaplanmış uyarı — saklanmaz. Metin ekranda çevirilerden ve bu alanlardan kurulur. */
export interface CostAlert {
  /** Kararlı anahtar: tür + kapsam + ay. */
  id: string;
  type: CostAlertType;
  severity: CostAlertSeverity;
  /** null = tüm hizmetler (GLOBAL bütçe). */
  service: CostService | null;
  month: string;
  /** Uyarıyı doğuran değer (harcama ya da tahmin) ve karşılaştırıldığı eşik / önceki ay (TL). */
  currentTry: number;
  thresholdTry: number | null;
  /** Bütçe kullanım yüzdesi (bütçe uyarıları) ya da önceki aya göre artış yüzdesi (SPIKE). */
  pct: number;
}

export interface ServiceMonthRow {
  service: CostService;
  amountTry: number;
  /** Toplam içindeki pay (0–100). */
  sharePct: number;
}

export interface TrendPoint {
  month: string;
  totalTry: number;
  byService: Partial<Record<CostService, number>>;
}

export interface CostOverview {
  /** İçinde bulunulan ay. */
  month: string;
  monthToDateTry: number;
  forecastTry: number;
  previousMonthTry: number;
  /** Geçen aya göre değişim (%, geçen ay 0 ise null). */
  monthOverMonthPct: number | null;
  byService: ServiceMonthRow[];
  /** Son 12 ay (eskiden yeniye), içinde bulunulan ay dahil. */
  trend: TrendPoint[];
  activeAlerts: number;
  /** Defterde hiç satır var mı (boş durum ekranı için). */
  hasEntries: boolean;
}

/** Hizmet × ay tablosu (Hizmetler ekranı). */
export interface ServicesMatrix {
  months: string[];
  rows: { service: CostService; byMonth: number[]; totalTry: number }[];
  totalsByMonth: number[];
  grandTotalTry: number;
}

/** Edoras sms_logs'tan tahmini SMS maliyeti — deftere yazılmaz, yalnız yanında gösterilir. */
export interface SmsEstimate {
  month: string;
  /** Aydaki toplam alıcı (sms_logs.recipient_count toplamı; otomatik + elle). */
  recipients: number;
  unitPriceTry: number;
  estimatedTry: number;
  /** Deftere girilmiş SMS satırlarının TL toplamı (aynı ay). */
  ledgerTry: number;
  /** Edoras okunamadı ya da okuma satır sınırına takıldı → sayı eksik olabilir. */
  available: boolean;
  truncated: boolean;
}

export interface CostSettings {
  smsUnitPriceTry: number;
  updatedAt: string | null;
}

export type MarginState = "HEALTHY" | "TIGHT" | "LOSS" | "NO_REVENUE";

/** Kurum başına maliyet (DeepSport "kullanıcı maliyeti"nin karşılığı) ve lisansa göre marj. */
export interface InstitutionCostRow {
  id: string;
  name: string;
  /** Payı belirleyen öğrenci sayısı (aktif dönemde sınıfa kayıtlı; yoksa toplam öğrenci). */
  students: number;
  /** Ortak maliyetten pay (TL). */
  sharedCostTry: number;
  /** Bu kurumun SMS'i (TL). */
  smsCostTry: number;
  totalCostTry: number;
  /** Bu aya düşen lisans geliri (lisans bedeli / 12; bedelsiz ve demo 0). */
  revenueTry: number;
  marginTry: number;
  /** Gelir 0 ise null. */
  marginPct: number | null;
  costPerStudentTry: number | null;
  margin: MarginState;
  /** Kurum kaydı: ücretli / demo / kayıtsız. */
  status: string | null;
}

export interface InstitutionCostsResponse {
  month: string;
  /** Kurumlar arasında paylaştırılan ortak maliyet (SMS hariç, bkz. smsMode). */
  sharedPoolTry: number;
  /** SMS'in nasıl dağıtıldığı: deftere SMS satırı varsa alıcı payıyla; yoksa alıcı × birim fiyat; yoksa 0. */
  smsMode: "LEDGER" | "ESTIMATE" | "NONE";
  smsTotalTry: number;
  smsAvailable: boolean;
  totalCostTry: number;
  totalRevenueTry: number;
  items: InstitutionCostRow[];
  /** Ortak maliyet dağıtacak öğrencisi olan kurum yoksa. */
  unallocatedTry: number;
}
