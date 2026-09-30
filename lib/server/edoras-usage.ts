import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getEdorasAdminClient } from "@/lib/supabase/server";
import { dbError } from "@/lib/api/server";
import { createLimiter } from "@/lib/utils/limiter";
import { ACTIVITY_SOURCES, type ActivitySource, type SourceCounts, type SourceDates, type UsageSignals } from "@/lib/domain/growth/types";
import { emptyCounts, emptyDates, latestDate, MAX_WINDOW_DAYS, toDay, windowStart } from "@/lib/domain/growth/usage";
import { bucketByWeek, weekStarts } from "@/lib/domain/growth/weekly";
import {
  MAX_EVENT_ROWS,
  istanbulRange,
  mergeEventPage,
  resolveEventWindow,
  type EventActorRole,
  type InstitutionEvent,
  type InstitutionEventType,
  type InstitutionEventsQuery,
  type InstitutionEventsResponse,
} from "@/lib/domain/activity/events";
import { fetchAll, listEdorasInstitutions } from "./edoras";

/**
 * Edoras KULLANIM sinyalleri (Müşteri analizleri). `edoras.ts` ile birlikte Edoras'a dokunan iki dosyadan biri; YALNIZ
 * OKUMA: `select` + `head:true` sayımlar. Yazan / yan etkili RPC yok; `institution_students_with_default_password` gibi ağır
 * RPC'ler çağrılmaz. Öğrenci kişisel verisi okunmaz — yalnız sayılar ve tarihler.
 *
 * Sinyaller (Edoras'ta "son giriş" kolonu yok; etkinlik = öğretmen/yönetici işlemleri):
 *   attendance    attendance_sessions.date         (institution_id, date) indeksli; en iyi günlük kullanım sinyali
 *   lessonTopics  lesson_topic_logs.date           (institution_id, date) indeksli
 *   assignments   assignments.created_at           institution_id indeksli; öğrencinin teslimi (student_assignments) sayılmaz
 *   exams         exams.created_at                 institution_id; exam_results.created_at KULLANILMAZ (yeniden puanlamada değişir)
 *   announcements announcements.created_at         institution_id indeksli
 *   sms           sms_logs.created_at              yalnız elle gönderim (send_type = 'auto' hariç; NULL dahil)
 * KULLANILMAYANLAR: user_notifications.read_at (2026-09-10 öncesi güvenilmez), user_devices.last_seen_at (yalnız push izinli
 * cihaz, çıkışta silinir), auth.users.last_sign_in_at (yalnız açık girişte değişir → düşük tahmin).
 * Tarih kolonları Türkiye gününe (Europe/Istanbul) çevrilir; `date` kolonları olduğu gibi alınır.
 *
 * Maliyet sınırı: kurum başına ≈ 3 (öğrenci/öğretmen/sınıf) + 1 (aktif dönem) + 1 (dönem kaydı) + 6 (pencere sayımı) + 6 (son
 * etkinlik günü) + ≤ 1 (aktif öğretmen) ≈ 18 istek, hepsi `head:true` ya da `limit ≤ 1000`; hiçbiri sayfalamasız tam tablo taraması
 * değil. Toplam eşzamanlı istek EDORAS_CONCURRENCY ile sınırlı (Edoras'ı yormamak için). Sonuç 5 dakika bellekte tutulur
 * (kurum + pencere anahtarıyla), aynı anda gelen istekler tek çalışmada birleşir. Pencere ≤ 180 gün.
 * Sınırlar: PostgREST 1000 satır (`limit`), ~8 sn zaman aşımı (her istek ayrı), service_role'ün tabloya GRANT'i şart (42501 →
 * o kaynak `unavailable`).
 */

const EDORAS_CONCURRENCY = 10;
const CACHE_TTL_MS = 5 * 60 * 1000;
const PAGE = 1000;
/** Haftalık seri: kurum + kaynak başına en çok bu kadar sayfa (2 × 1000 satır, yeniden eskiye). */
const WEEKLY_MAX_PAGES = 2;

interface SourceSpec {
  source: ActivitySource;
  table: string;
  column: string;
  /** `date` kolonu (YYYY-MM-DD) mu, zaman damgası mı. */
  kind: "date" | "timestamp";
  /** Elle gönderim süzgeci (yalnız sms). */
  manualOnly?: boolean;
}

const SOURCES: SourceSpec[] = [
  { source: "attendance", table: "attendance_sessions", column: "date", kind: "date" },
  { source: "lessonTopics", table: "lesson_topic_logs", column: "date", kind: "date" },
  { source: "assignments", table: "assignments", column: "created_at", kind: "timestamp" },
  { source: "exams", table: "exams", column: "created_at", kind: "timestamp" },
  { source: "announcements", table: "announcements", column: "created_at", kind: "timestamp" },
  { source: "sms", table: "sms_logs", column: "created_at", kind: "timestamp", manualOnly: true },
];

// --- Yardımcılar -----------------------------------------------------------------------------------

const limit = createLimiter(EDORAS_CONCURRENCY);

function applySource<Q extends { or: (filter: string) => Q }>(query: Q, spec: SourceSpec): Q {
  return spec.manualOnly ? query.or("send_type.is.null,send_type.neq.auto") : query;
}

async function headCount(db: SupabaseClient, table: string, filter: Record<string, string>): Promise<number> {
  let query = db.from(table).select("id", { count: "exact", head: true });
  for (const [column, value] of Object.entries(filter)) query = query.eq(column, value);
  const { count, error } = await query;
  if (error) throw dbError(error);
  return count ?? 0;
}

async function windowCount(db: SupabaseClient, spec: SourceSpec, institutionId: string, since: string): Promise<number> {
  const query = applySource(
    db.from(spec.table).select("id", { count: "exact", head: true }).eq("institution_id", institutionId).gte(spec.column, since),
    spec
  );
  const { count, error } = await query;
  if (error) throw dbError(error);
  return count ?? 0;
}

async function lastDay(db: SupabaseClient, spec: SourceSpec, institutionId: string): Promise<string | null> {
  const query = applySource(
    db.from(spec.table).select(spec.column).eq("institution_id", institutionId).order(spec.column, { ascending: false, nullsFirst: false }).limit(1),
    spec
  );
  const { data, error } = await query;
  if (error) throw dbError(error);
  const row = (data as unknown as Record<string, string | null>[] | null)?.[0];
  const value = row?.[spec.column];
  return value ? toDay(value) : null;
}

/** Kurumun aktif dönemi (id); yoksa null. */
async function activeTermId(db: SupabaseClient, institutionId: string): Promise<string | null> {
  const { data, error } = await db.from("academic_terms").select("id").eq("institution_id", institutionId).eq("is_active", true).limit(1);
  if (error) throw dbError(error);
  return ((data ?? [])[0] as { id: string } | undefined)?.id ?? null;
}

// --- Kurum başına kullanım -------------------------------------------------------------------------

async function collectUsage(db: SupabaseClient, institutionId: string, windowDays: number, termId: string | null | undefined): Promise<UsageSignals> {
  const since = windowStart(windowDays);
  const counts: SourceCounts = emptyCounts();
  const lastDates: SourceDates = emptyDates();
  const unavailable = new Set<ActivitySource>();

  const perSource = SOURCES.map(async (spec) => {
    try {
      const [count, last] = await Promise.all([
        limit(() => windowCount(db, spec, institutionId, since)),
        limit(() => lastDay(db, spec, institutionId)),
      ]);
      counts[spec.source] = count;
      lastDates[spec.source] = last;
    } catch {
      unavailable.add(spec.source);
    }
  });

  // Aktif öğretmen: penceredeki yoklama oturumlarının farklı öğretmenleri (en çok PAGE satır → alt sınır olabilir).
  const teachersTask = (async (): Promise<{ active: number | null; lowerBound: boolean }> => {
    try {
      const { data, error } = await limit(async () =>
        db.from("attendance_sessions").select("teacher_id").eq("institution_id", institutionId).gte("date", since).limit(PAGE)
      );
      if (error) throw dbError(error);
      const rows = (data ?? []) as { teacher_id: string | null }[];
      const ids = new Set(rows.map((r) => r.teacher_id).filter((v): v is string => !!v));
      return { active: ids.size, lowerBound: rows.length >= PAGE };
    } catch {
      return { active: null, lowerBound: false };
    }
  })();

  const enrolledTask = (async (): Promise<number | null> => {
    try {
      const term = termId === undefined ? await limit(() => activeTermId(db, institutionId)) : termId;
      if (!term) return null;
      return await limit(() => headCount(db, "term_student_classes", { institution_id: institutionId, term_id: term }));
    } catch {
      return null;
    }
  })();

  const [students, teachers, classes] = await Promise.all([
    limit(() => headCount(db, "students", { institution_id: institutionId })),
    limit(() => headCount(db, "institution_users", { institution_id: institutionId, role: "teacher" })),
    limit(() => headCount(db, "classes", { institution_id: institutionId })),
  ]);
  const [, teacherResult, enrolledStudents] = await Promise.all([Promise.all(perSource), teachersTask, enrolledTask]);

  return {
    windowDays,
    students,
    teachers,
    classes,
    enrolledStudents,
    // Yoklama kaynağı okunamadıysa aktif öğretmen de bilinmez.
    activeTeachers: unavailable.has("attendance") ? null : teacherResult.active,
    activeTeachersLowerBound: teacherResult.lowerBound,
    counts,
    lastDates,
    lastActivityOn: latestDate(lastDates),
    unavailable: ACTIVITY_SOURCES.filter((s) => unavailable.has(s)),
  };
}

// --- Önbellek + toplu okuma ------------------------------------------------------------------------

interface Cached<T> {
  at: number;
  value: T;
}

const usageCache = new Map<string, Cached<UsageSignals>>();
const usageInflight = new Map<string, Promise<UsageSignals | null>>();

function cacheKey(institutionId: string, windowDays: number) {
  return `${windowDays}:${institutionId}`;
}

function clampWindow(windowDays: number) {
  return Math.min(Math.max(1, Math.floor(windowDays)), MAX_WINDOW_DAYS);
}

/** Tüm kurumların aktif dönemi (tek istek; küçük tablo): kurum → dönem id. */
async function activeTermMap(db: SupabaseClient): Promise<Map<string, string>> {
  const rows = await fetchAll<{ id: string; institution_id: string | null }>((a, b) =>
    db.from("academic_terms").select("id, institution_id").eq("is_active", true).order("id").range(a, b)
  );
  const map = new Map<string, string>();
  for (const r of rows) if (r.institution_id && !map.has(r.institution_id)) map.set(r.institution_id, r.id);
  return map;
}

/**
 * Kurumların kullanım sinyalleri (kurum → sinyal). Okunamayan kurum haritada yoktur (kullanım "bilinmiyor").
 * 5 dakikalık bellek önbelleği; aynı anda gelen istekler birleşir.
 */
export async function getInstitutionsUsage(institutionIds: readonly string[], windowDays: number): Promise<Map<string, UsageSignals>> {
  const days = clampWindow(windowDays);
  const now = Date.now();
  const out = new Map<string, UsageSignals>();
  const missing: string[] = [];
  const waiting: Promise<void>[] = [];

  for (const id of institutionIds) {
    const key = cacheKey(id, days);
    const hit = usageCache.get(key);
    if (hit && now - hit.at < CACHE_TTL_MS) out.set(id, hit.value);
    else if (usageInflight.has(key)) {
      waiting.push(
        (usageInflight.get(key) as Promise<UsageSignals | null>).then((v) => {
          if (v) out.set(id, v);
        })
      );
    } else missing.push(id);
  }

  if (missing.length > 0) {
    const db = getEdorasAdminClient();
    let terms: Map<string, string> | null = null;
    try {
      terms = await activeTermMap(db);
    } catch {
      terms = null; // dönem listesi okunamadı → kurum başına ayrı sorulur (collectUsage içinde)
    }
    const started = missing.map((id) => {
      const key = cacheKey(id, days);
      const promise = collectUsage(db, id, days, terms ? (terms.get(id) ?? null) : undefined)
        .then((value) => {
          usageCache.set(key, { at: Date.now(), value });
          return value;
        })
        .catch(() => null)
        .finally(() => usageInflight.delete(key));
      usageInflight.set(key, promise);
      return promise.then((v) => {
        if (v) out.set(id, v);
      });
    });
    await Promise.all(started);
  }
  await Promise.all(waiting);
  return out;
}

/** Tek kurumun kullanımı (ayrıntı sayfası kartı). Okunamazsa null. */
export async function getInstitutionUsage(institutionId: string, windowDays: number): Promise<UsageSignals | null> {
  return (await getInstitutionsUsage([institutionId], windowDays)).get(institutionId) ?? null;
}

// --- Haftalık seri ---------------------------------------------------------------------------------

const weeklyCache = new Map<string, Cached<{ byInstitution: Record<string, number[]>; truncated: boolean }>>();
const weeklyInflight = new Map<string, Promise<{ byInstitution: Record<string, number[]>; truncated: boolean }>>();

async function sourceDays(db: SupabaseClient, spec: SourceSpec, institutionId: string, since: string): Promise<{ days: string[]; truncated: boolean }> {
  const days: string[] = [];
  for (let page = 0; page < WEEKLY_MAX_PAGES; page++) {
    const query = applySource(
      db
        .from(spec.table)
        .select(spec.column)
        .eq("institution_id", institutionId)
        .gte(spec.column, since)
        .order(spec.column, { ascending: false })
        .range(page * PAGE, page * PAGE + PAGE - 1),
      spec
    );
    const { data, error } = await limit(async () => query);
    if (error) throw dbError(error);
    const rows = (data as unknown as Record<string, string | null>[] | null) ?? [];
    for (const r of rows) {
      const v = r[spec.column];
      if (v) days.push(toDay(v));
    }
    if (rows.length < PAGE) return { days, truncated: false };
  }
  return { days, truncated: true };
}

/**
 * Kurum başına haftalık etkinlik sayısı (son `weeks` hafta, eskiden yeniye). Kaynak başına en çok WEEKLY_MAX_PAGES × 1000
 * satır (yeniden eskiye) okunur; sınıra takılırsa `truncated` (en eski haftalar eksik olabilir — yoklama en büyük kaynak).
 * Ağır olduğu için yalnız "Haftalık büyüme" bölümü açılınca çağrılır; sonuç 5 dakika önbellekte.
 */
export async function getWeeklyActivity(
  institutionIds: readonly string[],
  weeks: number
): Promise<{ weeks: string[]; byInstitution: Record<string, number[]>; truncated: boolean }> {
  const starts = weekStarts(weeks);
  const since = starts[0];
  const key = `${weeks}:${since}:${[...institutionIds].sort().join(",")}`;
  const now = Date.now();
  const hit = weeklyCache.get(key);
  if (hit && now - hit.at < CACHE_TTL_MS) return { weeks: starts, ...hit.value };
  const running = weeklyInflight.get(key);
  if (running) return { weeks: starts, ...(await running) };

  const db = getEdorasAdminClient();
  const job = (async () => {
    const byInstitution: Record<string, number[]> = {};
    let truncated = false;
    await Promise.all(
      institutionIds.map(async (id) => {
        const series = new Array<number>(starts.length).fill(0);
        await Promise.all(
          SOURCES.map(async (spec) => {
            try {
              const r = await sourceDays(db, spec, id, since);
              if (r.truncated) truncated = true;
              bucketByWeek(r.days, starts).forEach((n, i) => (series[i] += n));
            } catch {
              // Okunamayan kaynak seriye 0 katar (kullanım kartındaki `unavailable` ile aynı ilke).
            }
          })
        );
        byInstitution[id] = series;
      })
    );
    const value = { byInstitution, truncated };
    weeklyCache.set(key, { at: Date.now(), value });
    return value;
  })().finally(() => weeklyInflight.delete(key));
  weeklyInflight.set(key, job);
  return { weeks: starts, ...(await job) };
}

// --- Kurum etkinliği zaman çizelgesi (Aktivite geçmişi) ---------------------------------------------

/**
 * Aktivite geçmişi → "Kurum etkinliği": yukarıdaki kaynakların (+ deneme sonucu yayını) TEK TEK OLAYLARI, birleşik ve sayfalı.
 * YALNIZ OKUMA (select + head sayım). Öğrenci adı / kişisel veri okunmaz: satır başına zaman, kurum, tür, (yoklama / SMS için)
 * sayı ve kişinin ROLÜ (institution_users.role — yalnız sayfadaki kişiler için tek `in` sorgusu; ad okunmaz).
 * Sınırlar: pencere ≤ 90 gün; süzgeçler indeksli sütunlarda (institution_id + date / created_at); her kaynaktan en çok
 * (sayfa + 1) × boyut ≤ 1000 satır (PostgREST sınırı → yalnız en yeni 1000 olay gezilebilir, toplam sayı tam gelir).
 * Okunamayan kaynak (izin / zaman aşımı) `unavailable`'a düşer, diğerleri gösterilir.
 * Yoklama ve konu işleme `date` (indeksli) sütunuyla süzülür, satır zamanı taken_at / created_at'tir; geç girilen kayıtta
 * sıra günle sınırlıdır.
 */
interface EventSpec {
  type: InstitutionEventType;
  table: string;
  /** Aralık süzgeci ve birincil sıra (indeksli). */
  rangeColumn: string;
  kind: "date" | "timestamp";
  /** Satırın zaman damgası. */
  timeColumn: string;
  actorColumn: string;
  countColumn?: string;
  /** Yalnız bu sütunu dolu olanlar (deneme sonucu yayını). */
  notNullColumn?: string;
  /** Elle gönderim süzgeci (yalnız sms). */
  manualOnly?: boolean;
}

const EVENT_SPECS: EventSpec[] = [
  { type: "ATTENDANCE_TAKEN", table: "attendance_sessions", rangeColumn: "date", kind: "date", timeColumn: "taken_at", actorColumn: "teacher_id", countColumn: "student_count" },
  { type: "LESSON_TOPIC_LOGGED", table: "lesson_topic_logs", rangeColumn: "date", kind: "date", timeColumn: "created_at", actorColumn: "recorded_by" },
  { type: "ASSIGNMENT_CREATED", table: "assignments", rangeColumn: "created_at", kind: "timestamp", timeColumn: "created_at", actorColumn: "teacher_id" },
  { type: "EXAM_CREATED", table: "exams", rangeColumn: "created_at", kind: "timestamp", timeColumn: "created_at", actorColumn: "creator_id" },
  {
    type: "EXAM_RESULTS_PUBLISHED",
    table: "exams",
    rangeColumn: "results_published_at",
    kind: "timestamp",
    timeColumn: "results_published_at",
    actorColumn: "creator_id",
    notNullColumn: "results_published_at",
  },
  { type: "ANNOUNCEMENT_CREATED", table: "announcements", rangeColumn: "created_at", kind: "timestamp", timeColumn: "created_at", actorColumn: "created_by" },
  { type: "SMS_SENT", table: "sms_logs", rangeColumn: "created_at", kind: "timestamp", timeColumn: "created_at", actorColumn: "sent_by", countColumn: "recipient_count", manualOnly: true },
];

/** supabase-js'in genel tipleri koşullu süzgeçli zincirlerde çok derinleşir; yalnız kullanılan yöntemler. */
interface EventChain extends PromiseLike<{ data: unknown[] | null; error: { code?: string; message?: string } | null; count: number | null }> {
  eq(column: string, value: string): EventChain;
  gte(column: string, value: string): EventChain;
  lte(column: string, value: string): EventChain;
  lt(column: string, value: string): EventChain;
  not(column: string, operator: string, value: string | null): EventChain;
  or(filter: string): EventChain;
  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }): EventChain;
  limit(count: number): EventChain;
}

interface EventFilters {
  institutionId?: string;
  excludedInstitutionIds: readonly string[];
  window: { from: string; to: string };
}

function eventQuery(db: SupabaseClient, spec: EventSpec, columns: string, head: boolean, f: EventFilters): EventChain {
  const base = db.from(spec.table).select(columns, head ? { count: "exact", head: true } : undefined);
  let q = base as unknown as EventChain;
  if (f.institutionId) q = q.eq("institution_id", f.institutionId);
  else if (f.excludedInstitutionIds.length > 0) q = q.not("institution_id", "in", `(${f.excludedInstitutionIds.join(",")})`);
  if (spec.kind === "date") {
    q = q.gte(spec.rangeColumn, f.window.from).lte(spec.rangeColumn, f.window.to);
  } else {
    const range = istanbulRange(f.window.from, f.window.to);
    q = q.gte(spec.rangeColumn, range.start).lt(spec.rangeColumn, range.end);
  }
  if (spec.notNullColumn) q = q.not(spec.notNullColumn, "is", null);
  if (spec.manualOnly) q = q.or("send_type.is.null,send_type.neq.auto");
  return q;
}

interface RawEvent {
  id: string;
  at: string;
  institutionId: string;
  type: InstitutionEventType;
  actorId: string | null;
  count: number | null;
}

async function sourceEvents(db: SupabaseClient, spec: EventSpec, f: EventFilters, rows: number): Promise<RawEvent[]> {
  const columns = ["id", "institution_id", spec.rangeColumn, spec.timeColumn, spec.actorColumn, spec.countColumn].filter((c, i, a): c is string => !!c && a.indexOf(c) === i).join(", ");
  let q = eventQuery(db, spec, columns, false, f).order(spec.rangeColumn, { ascending: false });
  if (spec.timeColumn !== spec.rangeColumn) q = q.order(spec.timeColumn, { ascending: false, nullsFirst: false });
  const { data, error } = await limit(async () => q.limit(rows));
  if (error) throw dbError(error);
  const out: RawEvent[] = [];
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const time = row[spec.timeColumn] ?? row[spec.rangeColumn];
    const institutionId = row.institution_id;
    if (typeof time !== "string" || typeof institutionId !== "string") continue;
    // `date` sütunu (YYYY-MM-DD) zaman damgası yoksa günün başlangıcına (Türkiye) oturtulur.
    const at = /^\d{4}-\d{2}-\d{2}$/.test(time) ? `${time}T00:00:00+03:00` : time;
    const actor = row[spec.actorColumn];
    const count = spec.countColumn ? row[spec.countColumn] : null;
    out.push({
      id: `${spec.type}:${String(row.id)}`,
      at: new Date(at).toISOString(),
      institutionId,
      type: spec.type,
      actorId: typeof actor === "string" ? actor : null,
      count: typeof count === "number" ? count : null,
    });
  }
  return out;
}

/** Sayfadaki kişilerin kurumdaki rolü (ad okunmaz). Okunamazsa boş harita → rol "bilinmiyor". */
async function actorRoles(db: SupabaseClient, events: readonly RawEvent[]): Promise<Map<string, EventActorRole>> {
  const ids = [...new Set(events.map((e) => e.actorId).filter((v): v is string => !!v))];
  const out = new Map<string, EventActorRole>();
  if (ids.length === 0) return out;
  try {
    const { data, error } = await limit(async () => db.from("institution_users").select("user_id, institution_id, role").in("user_id", ids).limit(PAGE));
    if (error) throw dbError(error);
    for (const r of (data ?? []) as { user_id: string; institution_id: string; role: string | null }[]) {
      if (r.role === "admin" || r.role === "teacher" || r.role === "student" || r.role === "parent") {
        out.set(`${r.user_id}:${r.institution_id}`, r.role === "admin" ? "admin" : r.role === "teacher" ? "teacher" : "other");
      }
    }
  } catch {
    // rol bilinmiyor
  }
  return out;
}

export async function listInstitutionEvents(
  query: InstitutionEventsQuery,
  excludedInstitutionIds: readonly string[]
): Promise<InstitutionEventsResponse> {
  const db = getEdorasAdminClient();
  const window = resolveEventWindow(query.from, query.to);
  const filters: EventFilters = { institutionId: query.institutionId, excludedInstitutionIds, window };
  const specs = query.types.length > 0 ? EVENT_SPECS.filter((s) => query.types.includes(s.type)) : EVENT_SPECS;
  const rowsNeeded = Math.min(MAX_EVENT_ROWS, (query.page + 1) * query.size);

  const results = await Promise.all(
    specs.map(async (spec) => {
      try {
        const [count, rows] = await Promise.all([
          limit(async () => eventQuery(db, spec, "id", true, filters)).then(({ count: c, error }) => {
            if (error) throw dbError(error);
            return c ?? 0;
          }),
          sourceEvents(db, spec, filters, rowsNeeded),
        ]);
        return { spec, count, rows, ok: true as const };
      } catch {
        return { spec, count: 0, rows: [] as RawEvent[], ok: false as const };
      }
    })
  );

  const countsByType: Partial<Record<InstitutionEventType, number>> = {};
  const unavailable: InstitutionEventType[] = [];
  let total = 0;
  for (const r of results) {
    if (!r.ok) unavailable.push(r.spec.type);
    else {
      countsByType[r.spec.type] = r.count;
      total += r.count;
    }
  }

  const pageRows = mergeEventPage(
    results.map((r) => r.rows.map((e) => ({ ...e }))),
    query.page * query.size,
    query.size
  );
  const [institutions, roles] = await Promise.all([listEdorasInstitutions(), actorRoles(db, pageRows)]);
  const names = new Map(institutions.map((i) => [i.id, i.name]));

  const items: InstitutionEvent[] = pageRows.map((e) => ({
    id: e.id,
    at: e.at,
    institutionId: e.institutionId,
    institutionName: names.get(e.institutionId) ?? "—",
    type: e.type,
    actorRole: e.actorId ? (roles.get(`${e.actorId}:${e.institutionId}`) ?? null) : null,
    count: e.count,
  }));

  return {
    items,
    total,
    countsByType,
    page: query.page,
    size: query.size,
    lastPage: Math.max(0, Math.min(query.lastPage, Math.ceil(total / query.size) - 1)),
    window,
    unavailable,
    truncated: total > MAX_EVENT_ROWS,
  };
}

// --- Tahmini SMS maliyeti girdisi (Maliyetler) ------------------------------------------------------

const SMS_MAX_PAGES = 30;
const smsCache = new Map<string, Cached<{ byInstitution: Map<string, number>; truncated: boolean }>>();

/**
 * Bir ayın SMS alıcı sayısı (kurum → sms_logs.recipient_count toplamı; otomatik + elle, çünkü ikisi de para tutar). YALNIZ OKUMA:
 * `institution_id, recipient_count` sütunları, ayın created_at aralığı, 1000'erli sayfalarla en çok 30 sayfa (30.000 kayıt);
 * aşarsa `truncated`. Okunamazsa null ("bilinmiyor" — tahmin gösterilmez). 5 dakika önbellekli.
 */
export async function getSmsRecipientsByInstitution(month: string): Promise<{ byInstitution: Map<string, number>; truncated: boolean } | null> {
  const hit = smsCache.get(month);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
  const db = getEdorasAdminClient();
  const [year, mon] = month.split("-").map(Number);
  const start = `${month}-01T00:00:00+03:00`;
  const end = `${mon === 12 ? year + 1 : year}-${String(mon === 12 ? 1 : mon + 1).padStart(2, "0")}-01T00:00:00+03:00`;
  const byInstitution = new Map<string, number>();
  let truncated = false;
  try {
    for (let page = 0; ; page++) {
      if (page >= SMS_MAX_PAGES) {
        truncated = true;
        break;
      }
      const { data, error } = await limit(async () =>
        db
          .from("sms_logs")
          .select("institution_id, recipient_count")
          .gte("created_at", start)
          .lt("created_at", end)
          .order("id")
          .range(page * PAGE, page * PAGE + PAGE - 1)
      );
      if (error) throw dbError(error);
      const rows = (data ?? []) as { institution_id: string | null; recipient_count: number | null }[];
      for (const r of rows) {
        if (r.institution_id) byInstitution.set(r.institution_id, (byInstitution.get(r.institution_id) ?? 0) + (r.recipient_count ?? 0));
      }
      if (rows.length < PAGE) break;
    }
  } catch {
    return null;
  }
  const value = { byInstitution, truncated };
  smsCache.set(month, { at: Date.now(), value });
  return value;
}
