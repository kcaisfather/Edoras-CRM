import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { dbError, type StaffContext } from "@/lib/api/server";
import { addDaysIso } from "@/lib/domain/crm/offer";
import { daysBetween, todayIso } from "@/lib/domain/institutions/rules";
import { sortNotifications, type NotificationItem, type NotificationsDto } from "@/lib/domain/notifications/logic";
import { fetchAll } from "./edoras";
import { dueTaskCount } from "./crm-tasks";

/**
 * Bildirim zili: mevcut verilerden türetilir, saklanmaz. Yalnız CRM projesi okunur; tutar ve kişisel iletişim bilgisi
 * taşınmaz (kurum / aday adı ve sayılar). Her bildirimin `signature`'ı içeriği değişince değişir (görüldü kaydı için).
 *
 * - Görev: çağıranın gördüğü bugün + gecikmiş açık görev sayısı (menü rozetiyle aynı hesap).
 * - Randevu: çağırana atanmış, 24 saat içinde başlayacak ya da saati geçmiş açık randevular (en çok 5).
 * - Destek talebi: atanmamış + çağırana atanmış açık (OPEN) talep sayısı.
 * - Anket: son 7 günde gelen yanıt sayısı.
 * - Lisans / demo: 7 gün içinde biten, yenilenmemiş (en çok 5); iç kurumlar hariç.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const LICENSE_WINDOW_DAYS = 7;
const LIST_MAX = 5;

async function taskItem(staff: StaffContext): Promise<NotificationItem[]> {
  const count = await dueTaskCount(staff);
  return count > 0 ? [{ id: "tasks", kind: "TASKS_DUE", signature: String(count), href: "/crm/tasks", count }] : [];
}

async function ticketItem(staff: StaffContext): Promise<NotificationItem[]> {
  const { data, error } = await getSupabaseAdminClient()
    .from("crm_tickets")
    .select("created_at")
    .eq("status", "OPEN")
    .or(`assignee_id.is.null,assignee_id.eq.${staff.userId}`)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw dbError(error);
  const rows = (data ?? []) as { created_at: string }[];
  if (!rows.length) return [];
  return [{ id: "tickets", kind: "TICKETS_OPEN", signature: `${rows.length}:${rows[0].created_at}`, href: "/crm/tickets", count: rows.length }];
}

async function appointmentItems(staff: StaffContext, now: number): Promise<NotificationItem[]> {
  const db = getSupabaseAdminClient();
  const { data, error } = await db
    .from("crm_appointments")
    .select("id, lead_id, starts_at")
    .eq("status", "SCHEDULED")
    .eq("assignee_id", staff.userId)
    .lt("starts_at", new Date(now + DAY_MS).toISOString())
    .order("starts_at", { ascending: true })
    .limit(LIST_MAX);
  if (error) throw dbError(error);
  const rows = (data ?? []) as { id: string; lead_id: string; starts_at: string }[];
  if (!rows.length) return [];

  const { data: leads, error: leadError } = await db
    .from("crm_leads")
    .select("id, organization_name, contact_first_name, contact_last_name")
    .in("id", [...new Set(rows.map((r) => r.lead_id))]);
  if (leadError) throw dbError(leadError);
  const names = new Map(
    ((leads ?? []) as { id: string; organization_name: string | null; contact_first_name: string | null; contact_last_name: string | null }[]).map((l) => [
      l.id,
      l.organization_name ?? ([l.contact_first_name, l.contact_last_name].filter(Boolean).join(" ").trim() || null),
    ])
  );
  return rows.map((r) => {
    const at = Date.parse(r.starts_at);
    return {
      id: `appt:${r.id}`,
      kind: "APPOINTMENT" as const,
      signature: r.starts_at,
      href: `/crm?lead=${encodeURIComponent(r.lead_id)}`,
      name: names.get(r.lead_id) ?? null,
      at,
      overdue: at < now,
    };
  });
}

async function surveyItem(now: number): Promise<NotificationItem[]> {
  const db = getSupabaseAdminClient();
  const since = new Date(now - 7 * DAY_MS).toISOString();
  const [count, latest] = await Promise.all([
    db.from("crm_survey_responses").select("id", { count: "exact", head: true }).gte("created_at", since),
    db.from("crm_survey_responses").select("created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(1),
  ]);
  if (count.error) throw dbError(count.error);
  if (latest.error) throw dbError(latest.error);
  const n = count.count ?? 0;
  if (n === 0) return [];
  const last = (latest.data?.[0] as { created_at: string } | undefined)?.created_at ?? "";
  return [{ id: "survey", kind: "SURVEY_RESPONSES", signature: `${n}:${last}`, href: "/crm/surveys", count: n }];
}

async function licenseItems(): Promise<NotificationItem[]> {
  const db = getSupabaseAdminClient();
  const today = todayIso();
  const limit = addDaysIso(today, LICENSE_WINDOW_DAYS);

  const [licenses, demos, internal] = await Promise.all([
    fetchAll<{ institution_id: string; ends_on: string }>((a, b) =>
      db.from("crm_licenses").select("institution_id, ends_on").gt("ends_on", today).order("id").range(a, b)
    ),
    fetchAll<{ institution_id: string; demo_ends_at: string }>((a, b) =>
      db
        .from("crm_institutions")
        .select("institution_id, demo_ends_at")
        .eq("status", "DEMO")
        .gt("demo_ends_at", today)
        .lte("demo_ends_at", limit)
        .order("institution_id")
        .range(a, b)
    ),
    fetchAll<{ institution_id: string }>((a, b) => db.from("crm_internal_institutions").select("institution_id").order("institution_id").range(a, b)),
  ]);
  const skip = new Set(internal.map((r) => r.institution_id));

  // Kurumun en geç biten lisansı: pencerede bitiyorsa yenilenmemiştir.
  const lastEnd = new Map<string, string>();
  for (const l of licenses) if (!lastEnd.get(l.institution_id) || l.ends_on > (lastEnd.get(l.institution_id) as string)) lastEnd.set(l.institution_id, l.ends_on);

  const due: { id: string; end: string; demo: boolean }[] = [];
  for (const [id, end] of lastEnd) if (end <= limit && !skip.has(id)) due.push({ id, end, demo: false });
  const paid = new Set(due.map((d) => d.id));
  for (const d of demos) if (!skip.has(d.institution_id) && !paid.has(d.institution_id)) due.push({ id: d.institution_id, end: d.demo_ends_at, demo: true });
  if (!due.length) return [];

  due.sort((a, b) => a.end.localeCompare(b.end));
  const shown = due.slice(0, LIST_MAX);
  const { data, error } = await db.from("crm_institutions").select("institution_id, institution_name").in("institution_id", shown.map((d) => d.id));
  if (error) throw dbError(error);
  const names = new Map(((data ?? []) as { institution_id: string; institution_name: string }[]).map((r) => [r.institution_id, r.institution_name]));
  return shown.map((d) => ({
    id: `license:${d.id}`,
    kind: "LICENSE_ENDING" as const,
    signature: d.end,
    href: `/institutions/${d.id}`,
    name: names.get(d.id) ?? null,
    daysLeft: daysBetween(today, d.end),
    demo: d.demo,
  }));
}

export async function getNotifications(staff: StaffContext, now = Date.now()): Promise<NotificationsDto> {
  const [tasks, appointments, tickets, survey, licenses] = await Promise.all([
    taskItem(staff),
    appointmentItems(staff, now),
    ticketItem(staff),
    surveyItem(now),
    licenseItems(),
  ]);
  return { items: sortNotifications([...appointments, ...tasks, ...tickets, ...licenses, ...survey]), generatedAt: now };
}
