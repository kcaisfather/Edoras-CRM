import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/server";
import type { StaffContext } from "@/lib/api/server";
import { istanbulToMs, msToIstanbul } from "@/lib/domain/crm/appointment";
import { todayIso } from "@/lib/domain/institutions/rules";
import { aggregatePerformance, redactMoney, type DayRange, type PerfInput, type PerfMetrics, type PerfRow } from "@/lib/domain/performance/aggregate";
import { fetchAll } from "./edoras";

/**
 * Satış Performansı (salt okuma): dönemdeki teklif / satış / tahsilat / arama / not / randevu / yeni aday kişi başına
 * toplanır (lib/domain/performance/aggregate.ts). Yalnız CRM projesi okunur; Edoras'a gidilmez.
 *
 * Yetki: ADMIN herkesi ve tutarları görür. CRM_AGENT yalnız KENDİ satırını görür ve tutarlar sunucuda sıfırlanır
 * (diğer ekran uçlarındaki EK-3 kuralıyla aynı) — başkasının sayısı hiç gönderilmez.
 */

export interface PerformanceResult {
  range: DayRange;
  /** Tutarlar (teklif, satış, tahsilat) bu yanıtta gerçek mi — CRM_AGENT için false. */
  financial: boolean;
  rows: PerfRow[];
  totals: PerfMetrics;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const toNumber = (v: number | string | null): number | null => (v == null ? null : Number(v));

/** [from, to] İstanbul günleri → zaman damgası aralığı [başlangıç, bitişin ertesi günü). */
function bounds(range: DayRange): { gte: string; lt: string } {
  return {
    gte: new Date(istanbulToMs(range.from, "00:00")).toISOString(),
    lt: new Date(istanbulToMs(range.to, "00:00") + DAY_MS).toISOString(),
  };
}

export async function getPerformance(range: DayRange, staff: StaffContext): Promise<PerformanceResult> {
  const db = getSupabaseAdminClient();
  const { gte, lt } = bounds(range);
  const financial = staff.role === "ADMIN";

  const [staffRows, leads, doneTasks, openTasks, notes, payments, appointments] = await Promise.all([
    fetchAll<{ user_id: string; full_name: string | null; is_active: boolean }>((a, b) =>
      db.from("crm_staff").select("user_id, full_name, is_active").order("user_id").range(a, b)
    ),
    fetchAll<{
      owner_id: string | null;
      created_at: string;
      offer_sent_at: string | null;
      offer_by: string | null;
      offer_amount: number | string | null;
      sold_at: string | null;
      sold_by: string | null;
      sale_amount: number | string | null;
    }>((a, b) =>
      db
        .from("crm_leads")
        .select("owner_id, created_at, offer_sent_at, offer_by, offer_amount, sold_at, sold_by, sale_amount")
        .or(
          `and(created_at.gte.${gte},created_at.lt.${lt}),and(offer_sent_at.gte.${range.from},offer_sent_at.lte.${range.to}),and(sold_at.gte.${range.from},sold_at.lte.${range.to})`
        )
        .order("id")
        .range(a, b)
    ),
    fetchAll<{ completed_at: string; completed_by: string | null; outcome: string | null }>((a, b) =>
      db
        .from("crm_tasks")
        .select("completed_at, completed_by, outcome")
        .eq("status", "DONE")
        .gte("completed_at", gte)
        .lt("completed_at", lt)
        .order("id")
        .range(a, b)
    ),
    fetchAll<{ assignee_id: string | null; due_date: string }>((a, b) =>
      db.from("crm_tasks").select("assignee_id, due_date").eq("status", "OPEN").not("assignee_id", "is", null).order("id").range(a, b)
    ),
    fetchAll<{ author_id: string | null; created_at: string }>((a, b) =>
      db.from("crm_notes").select("author_id, created_at").gte("created_at", gte).lt("created_at", lt).order("id").range(a, b)
    ),
    financial
      ? fetchAll<{ created_by: string | null; paid_on: string; amount: number | string }>((a, b) =>
          db.from("crm_payments").select("created_by, paid_on, amount").gte("paid_on", range.from).lte("paid_on", range.to).order("id").range(a, b)
        )
      : Promise.resolve([]),
    fetchAll<{ assignee_id: string | null; starts_at: string; status: string }>((a, b) =>
      db.from("crm_appointments").select("assignee_id, starts_at, status").gte("starts_at", gte).lt("starts_at", lt).order("id").range(a, b)
    ),
  ]);

  const input: PerfInput = {
    range,
    today: todayIso(),
    staff: staffRows.map((s) => ({ id: s.user_id, name: s.full_name?.trim() || "—", active: s.is_active })),
    leads: leads.map((l) => ({
      ownerId: l.owner_id,
      createdAt: Date.parse(l.created_at),
      offerSentAt: l.offer_sent_at,
      offerBy: l.offer_by,
      offerAmount: toNumber(l.offer_amount),
      soldAt: l.sold_at,
      soldBy: l.sold_by,
      saleAmount: toNumber(l.sale_amount),
    })),
    doneTasks: doneTasks.map((t) => ({ completedAt: Date.parse(t.completed_at), completedBy: t.completed_by, outcome: t.outcome })),
    openTasks: openTasks.map((t) => ({ assigneeId: t.assignee_id, dueDate: t.due_date })),
    notes: notes.map((n) => ({ authorId: n.author_id, createdAt: Date.parse(n.created_at) })),
    payments: payments.map((p) => ({ createdBy: p.created_by, paidOn: p.paid_on, amount: Number(p.amount) })),
    appointments: appointments.map((a) => ({ assigneeId: a.assignee_id, startsAt: Date.parse(a.starts_at), status: a.status })),
  };

  const { rows, totals } = aggregatePerformance(input);
  if (financial) return { range, financial, rows, totals };

  // CRM_AGENT: yalnız kendi satırı, tutarsız.
  const mine = rows.filter((r) => r.userId === staff.userId).map((r) => ({ ...r, metrics: redactMoney(r.metrics) }));
  return { range, financial, rows: mine, totals: mine[0]?.metrics ?? zeroed(totals) };
}

/** Satırı olmayan CRM_AGENT için başkasının toplamını sızdırmayan boş toplam. */
function zeroed(sample: PerfMetrics): PerfMetrics {
  return Object.fromEntries(Object.keys(sample).map((k) => [k, 0])) as unknown as PerfMetrics;
}

/** Varsayılan dönem: bugün dahil son 30 gün (İstanbul). */
export function defaultRange(now = new Date()): DayRange {
  const to = msToIstanbul(now.getTime()).date;
  const from = msToIstanbul(istanbulToMs(to, "12:00") - 29 * DAY_MS).date;
  return { from, to };
}
