import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getEdorasAdminClient } from "@/lib/supabase/server";
import { dbError } from "@/lib/api/server";
import { createLimiter } from "@/lib/utils/limiter";
import { ACTIVITY_SOURCES, type ActivitySource, type SourceCounts, type SourceDates, type UsageSignals } from "@/lib/domain/growth/types";
import { emptyCounts, emptyDates, latestDate, MAX_WINDOW_DAYS, toDay, windowStart } from "@/lib/domain/growth/usage";
import { bucketByWeek, weekStarts } from "@/lib/domain/growth/weekly";
import { fetchAll } from "./edoras";

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
