/**
 * Satış Performansı — saf toplama (React / veritabanından bağımsız; testler aggregate.test.ts).
 * DeepSportAdmin features/sales-performance/logic.ts'ten, CRM'in kendi verisine uyarlandı: kişi başına arama sonuçları
 * (tamamlanan görevler), not, teklif (offer_by), satış (sold_by), tahsilat (ödemeyi giren), randevu ve yeni aday.
 * Takvim günü her yerde Europe/Istanbul (UTC+3 sabit, lib/domain/crm/appointment.ts).
 */
import { msToIstanbul } from "@/lib/domain/crm/appointment";

export interface DayRange {
  /** YYYY-MM-DD, iki uç dahil (İstanbul). */
  from: string;
  to: string;
}

export interface PerfMetrics {
  /** Sahibi olunan adaylardan dönemde açılanlar. */
  newLeads: number;
  /** Tamamlanan arama görevleri (kural + atanan). */
  calls: number;
  /** Konuşulan: "ulaşıldı", "tekrar ara", "ilgilenmiyor" — karşı taraf açtı. */
  reached: number;
  /** "Ulaşılamadı". */
  unreached: number;
  notes: number;
  offersCount: number;
  offersAmount: number;
  salesCount: number;
  salesAmount: number;
  collectionsCount: number;
  collectionsAmount: number;
  /** Randevu: tarihi dönemde olan (iptal hariç), gerçekleşen, gelmeyen. */
  appointmentsPlanned: number;
  appointmentsHeld: number;
  appointmentsNoShow: number;
  /** Anlık durum (dönemden bağımsız): kişiye atanmış açık ve vadesi geçmiş görevler. */
  tasksOpen: number;
  tasksOverdue: number;
}

export const METRIC_KEYS = [
  "newLeads",
  "calls",
  "reached",
  "unreached",
  "notes",
  "offersCount",
  "offersAmount",
  "salesCount",
  "salesAmount",
  "collectionsCount",
  "collectionsAmount",
  "appointmentsPlanned",
  "appointmentsHeld",
  "appointmentsNoShow",
  "tasksOpen",
  "tasksOverdue",
] as const satisfies readonly (keyof PerfMetrics)[];

/** Tutar içeren metrikler — CRM_AGENT için sunucuda sıfırlanır. */
export const MONEY_KEYS = ["offersAmount", "salesAmount", "collectionsAmount"] as const satisfies readonly (keyof PerfMetrics)[];

export const emptyMetrics = (): PerfMetrics => ({
  newLeads: 0,
  calls: 0,
  reached: 0,
  unreached: 0,
  notes: 0,
  offersCount: 0,
  offersAmount: 0,
  salesCount: 0,
  salesAmount: 0,
  collectionsCount: 0,
  collectionsAmount: 0,
  appointmentsPlanned: 0,
  appointmentsHeld: 0,
  appointmentsNoShow: 0,
  tasksOpen: 0,
  tasksOverdue: 0,
});

export interface PerfRow {
  userId: string;
  name: string;
  metrics: PerfMetrics;
}

/** Toplama girdisi: sunucunun okuduğu ham satırların yalnız gereken alanları. */
export interface PerfInput {
  range: DayRange;
  /** Bugün (YYYY-MM-DD, İstanbul) — gecikmiş görevler için. */
  today: string;
  staff: { id: string; name: string; active: boolean }[];
  leads: {
    ownerId: string | null;
    createdAt: number;
    offerSentAt: string | null;
    offerBy: string | null;
    offerAmount: number | null;
    soldAt: string | null;
    soldBy: string | null;
    saleAmount: number | null;
  }[];
  /** Dönemde tamamlanan görevler. */
  doneTasks: { completedAt: number; completedBy: string | null; outcome: string | null }[];
  /** Açık (OPEN) ve kişiye atanmış görevler. */
  openTasks: { assigneeId: string | null; dueDate: string }[];
  notes: { authorId: string | null; createdAt: number }[];
  payments: { createdBy: string | null; paidOn: string; amount: number }[];
  appointments: { assigneeId: string | null; startsAt: number; status: string }[];
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function inRange(day: string | null | undefined, r: DayRange): day is string {
  return !!day && DAY_RE.test(day) && day >= r.from && day <= r.to;
}

const dayOfMs = (ms: number) => msToIstanbul(ms).date;

/** Gün sayısı (iki uç dahil). */
export function daySpan(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

/** "Ulaşılamadı" dışındaki sonuçlar konuşma sayılır. */
export const UNREACHED_OUTCOME = "ulasilamadi";

/**
 * Kişi başına metrikleri toplar. Kaydın sahibi bilinmiyorsa (null) ya da ekip listesinde yoksa o kayıt sayılmaz.
 * Pasif personel yalnız dönemde etkinliği varsa satır alır; aktif personel etkinliği olmasa da görünür.
 */
export function aggregatePerformance(input: PerfInput): { rows: PerfRow[]; totals: PerfMetrics } {
  const { range } = input;
  const by = new Map<string, PerfMetrics>(input.staff.map((s) => [s.id, emptyMetrics()]));
  const bump = (id: string | null, f: (m: PerfMetrics) => void) => {
    const m = id ? by.get(id) : undefined;
    if (m) f(m);
  };

  for (const l of input.leads) {
    if (inRange(dayOfMs(l.createdAt), range)) bump(l.ownerId, (m) => void (m.newLeads += 1));
    if (inRange(l.offerSentAt, range)) {
      bump(l.offerBy, (m) => {
        m.offersCount += 1;
        m.offersAmount += l.offerAmount ?? 0;
      });
    }
    if (inRange(l.soldAt, range)) {
      bump(l.soldBy, (m) => {
        m.salesCount += 1;
        m.salesAmount += l.saleAmount ?? 0;
      });
    }
  }

  for (const t of input.doneTasks) {
    if (!inRange(dayOfMs(t.completedAt), range)) continue;
    bump(t.completedBy, (m) => {
      m.calls += 1;
      if (t.outcome === UNREACHED_OUTCOME) m.unreached += 1;
      else if (t.outcome) m.reached += 1;
    });
  }

  for (const t of input.openTasks) {
    bump(t.assigneeId, (m) => {
      m.tasksOpen += 1;
      if (t.dueDate < input.today) m.tasksOverdue += 1;
    });
  }

  for (const n of input.notes) {
    if (inRange(dayOfMs(n.createdAt), range)) bump(n.authorId, (m) => void (m.notes += 1));
  }

  for (const p of input.payments) {
    if (!inRange(p.paidOn, range)) continue;
    bump(p.createdBy, (m) => {
      m.collectionsCount += 1;
      m.collectionsAmount += p.amount;
    });
  }

  for (const a of input.appointments) {
    if (!inRange(dayOfMs(a.startsAt), range) || a.status === "CANCELLED") continue;
    bump(a.assigneeId, (m) => {
      m.appointmentsPlanned += 1;
      if (a.status === "HELD") m.appointmentsHeld += 1;
      if (a.status === "NO_SHOW") m.appointmentsNoShow += 1;
    });
  }

  const rows: PerfRow[] = input.staff
    .map((s) => ({ userId: s.id, name: s.name, metrics: by.get(s.id) as PerfMetrics, active: s.active }))
    .filter((r) => r.active || METRIC_KEYS.some((k) => k !== "tasksOpen" && k !== "tasksOverdue" && r.metrics[k] > 0))
    .map(({ active: _active, ...row }) => row)
    .sort((a, b) => b.metrics.salesAmount - a.metrics.salesAmount || b.metrics.salesCount - a.metrics.salesCount || a.name.localeCompare(b.name, "tr"));

  return { rows, totals: sumMetrics(rows.map((r) => r.metrics)) };
}

export function sumMetrics(list: readonly PerfMetrics[]): PerfMetrics {
  const total = emptyMetrics();
  for (const m of list) for (const k of METRIC_KEYS) total[k] += m[k];
  return total;
}

/** Tutar metriklerini sıfırlar (CRM_AGENT). */
export function redactMoney(m: PerfMetrics): PerfMetrics {
  const out = { ...m };
  for (const k of MONEY_KEYS) out[k] = 0;
  return out;
}

/** Oran (0–1); payda 0 ise null. */
export function rate(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null;
}

/** CSV hücresi: formül enjeksiyonuna karşı = + - @ ile başlayanlar önek alır; tırnak/virgül/satır sonu kaçırılır. */
export function csvCell(value: string | number): string {
  const s = String(value);
  const safe = /^[=+\-@\t\r]/.test(s) && typeof value === "string" ? `'${s}` : s;
  return /[",\n\r;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
