/**
 * Öğretmen kullanımı (kurum ayrıntısındaki "Öğretmen kullanımı" kartı) — saf şekillendirme; testler staff-activity.test.ts.
 *
 * Kaynak: Edoras RPC `staff_activity_summary(institution_id, since, until)` (edoras-admin migration 305, ödev dalı 315,
 * web oturumu + onaylanan görev + pencere sınırı yok 338).
 * Satır = (kişi, işlem türü) + kişi başına bir `total` satırı. Ölçüler:
 *   events   = kaynak kayıt sayısı
 *   sessions = işlem: aynı kişi + aynı dakika = 1 (mobilde farklı oturum)
 *   days     = işlem yapılan farklı gün
 * Ödevde (315) iki ölçü de anlamlı, iki sütun olarak gösterilir:
 *   events   = TEKİL GÖREV: öğrenciye düşen görev (sınıf ödevi 30 öğrenciye = 30; kütüphane şablonu sayılmaz)
 *   sessions = ÖDEV PAKETİ: farklı (hedef, oluşturma haftası) — hedef bireysel ödevde öğrenci, sınıf ödevinde sınıf;
 *              o hafta kaç kez kaydedilip revize edilirse edilsin 1
 * Onaylanan görev (338) = kişinin "Onayla" dediği tekil görev ADEDİ (events; "Ödev kontrolü" dakikayı 1 sayar).
 * Toplu ödev onayı (343) = aynı RPC satırının sessions'ı: onaylanan görevlerin ait olduğu farklı paket (paket anahtarı
 *   ödevdekiyle aynı: hedef + oluşturma haftası). Kart: Toplu ödev | Toplu ödev onayı | Tekli ödev | Tekli ödev onayı.
 * Onaya yollanan (rehber) = rehber öğretmenin (`student_guidance_assignments`) öğrencilerinden ŞU AN onay bekleyen
 *   (`status = submitted`) görev adedi; pencereden bağımsız anlık birikim. RPC satırı değil, CRM sunucusu üretir
 *   (`guidance_awaiting`, events); "işlem" toplamına ve aktif güne girmez.
 * Verilen ödev (349) = öğretmenin OLUŞTURDUĞU ödev kaydı sayısı (events); sınıfa verilen ödev, öğrenci sayısıyla çarpılmadan 1.
 *   RPC henüz 349'u içermiyorsa 0 görünür. Paket başı görev = tekli ödev ÷ toplu ödev (türetilmiş, yuvarlanır).
 * Web oturum (338) = web paneli giriş oturumu × gün; sessions = farklı oturum. Panel bunu 26.10'dan beri kaydeder.
 *
 * SADELEŞME (2026-11-03, kullanıcı): sütunlar Yoklama · Konu işleme · Verilen ödev · Onaylanan ödev · Toplu ödev · Onaya
 * yollanan ödev · Birebir · Deneme · Duyuru · SMS · Mobil · Web · Aktif gün. KALDIRILDI: Toplu ödev onayı, Tekli ödev,
 * Paket başı ödev, Ödev kontrolü. "Tekli ödev" ile "Verilen ödev" teke indi: bireysel ödevde ikisi aynı sayıydı (1 ödev =
 * 1 öğrenci), sınıf ödevinde Tekli öğrenci sayısıyla çarpılıyordu (30 kişilik sınıfa 1 ödev = 30) → kalan "Verilen ödev"
 * (oluşturulan ödev kaydı). "Son işlem" sütun değil, kişinin adının yanında etiket. Rehberler (öğrenciye rehber atanmış
 * ya da branşı rehberlik/PDR) "Rehber" etiketiyle EN ÜSTTE alt alta.
 * Hangi sütunun hangi ölçüyü gösterdiği `COLUMN_METRIC`'te; hücre / CSV / mobil hep `cellValue` ile okur.
 * Aktif gün işlemler arasında TOPLANAMAZ (aynı gün yoklama + ödev iki gün sayılır); kişinin genel aktif günü yalnız
 * `total` satırından gelir. Birleşik sütunlarda (Deneme, Birebir) gün = alt sınır (en büyük parça), işlem = toplam.
 */
import { DEFAULT_WINDOW_DAYS } from "./usage";

/** RPC'nin döndürdüğü işlem türleri (migration 305 başlığı). */
export const STAFF_RPC_ACTIONS = [
  "attendance",
  "lesson_topic",
  "assignment",
  "review",
  "exam_created",
  "exam_published",
  "announcement",
  "sms",
  "private_lesson_series",
  "private_lesson_attendance",
  "mobile",
  "review_approved",
  "web",
  /** RPC DEĞİL: CRM sunucusu `student_guidance_assignments` × `student_assignments.status = submitted` ile kendisi üretir. */
  "guidance_awaiting",
  /** Edoras migration 349: öğretmenin oluşturduğu ödev kaydı (sınıf ödevi 1). */
  "assignment_created",
  /**
   * RPC DEĞİL (2026-11-03): CRM sunucusu üretir — öğretmenin öğrencisi (aktif dönemde derse girdiği sınıflar
   * `class_assignments` × `term_student_classes` ∪ rehber öğrencileri ∪ pencerede ödev verdiği öğrenciler) ve bunlardan
   * pencerede bu öğretmenden ödev alanlar.
   */
  "students_total",
  "students_with_homework",
  /** RPC DEĞİL (Edoras migration 354 `staff_screen_events`): web ekran sayacı, her açılış / indirme 1. */
  "screen_analysis",
  "screen_homework",
  "screen_exam_download",
  "screen_homework_pdf",
] as const;
export type StaffRpcAction = (typeof STAFF_RPC_ACTIONS)[number];

/** Karttaki sütunlar (soldan sağa) ve hangi RPC işlemlerinden oluştukları. */
export const STAFF_COLUMNS = [
  "attendance",
  "lessonTopic",
  "assignmentCreated",
  "reviewApproved",
  "assignment",
  "guidanceAwaiting",
  "privateLesson",
  "exam",
  "announcement",
  "sms",
  "mobile",
  "web",
  "students",
  "studentsWithHomework",
  "analysisViews",
  "homeworkViews",
  "examDownloads",
  "homeworkPdfs",
] as const;
export type StaffColumn = (typeof STAFF_COLUMNS)[number];

/**
 * "Toplu ödev" = `assignment` satırının paketi (sessions); "Onaylanan ödev" = `review_approved` satırının onaylanan görev
 * adedi (events). RPC'nin `review` (ödev kontrolü) satırı artık hiçbir sütuna düşmez → yok sayılır.
 */
const COLUMN_SOURCES: Record<StaffColumn, readonly StaffRpcAction[]> = {
  attendance: ["attendance"],
  lessonTopic: ["lesson_topic"],
  assignmentCreated: ["assignment_created"],
  assignment: ["assignment"],
  reviewApproved: ["review_approved"],
  guidanceAwaiting: ["guidance_awaiting"],
  privateLesson: ["private_lesson_series", "private_lesson_attendance"],
  exam: ["exam_created", "exam_published"],
  announcement: ["announcement"],
  sms: ["sms"],
  mobile: ["mobile"],
  web: ["web"],
  students: ["students_total"],
  studentsWithHomework: ["students_with_homework"],
  analysisViews: ["screen_analysis"],
  homeworkViews: ["screen_homework"],
  examDownloads: ["screen_exam_download"],
  homeworkPdfs: ["screen_homework_pdf"],
};

/**
 * "İşlem" toplamına (yalnız sıralamada kullanılır) girmeyen sütunlar: oturumlar (mobil, web) iş değil kullanım; onaylanan
 * ödev, onaya yollanan ve verilen ödev ödev işinin başka bir ölçüsü (paket "Toplu ödev"de bir kez sayılır).
 */
const NOT_AN_ACTION: ReadonlySet<StaffColumn> = new Set([
  "mobile",
  "web",
  "reviewApproved",
  "guidanceAwaiting",
  "assignmentCreated",
  "students",
  "studentsWithHomework",
  "analysisViews",
  "homeworkViews",
  "examDownloads",
  "homeworkPdfs",
]);

export interface StaffActivityRpcRow {
  user_id: string;
  action: string;
  event_count: number;
  session_count: number;
  active_days: number;
  last_day: string | null;
}

export interface StaffMember {
  userId: string;
  role: string | null;
  /** `institution_users.is_active` ve `deactivated_at` birlikte ("Kurumdan çıkar" = pasif). */
  active: boolean;
}

export interface StaffProfile {
  id: string;
  fullName: string | null;
  branch: string | null;
}

export interface StaffCell {
  events: number;
  sessions: number;
  days: number;
}

export type StaffRole = "admin" | "teacher" | "other";

export interface StaffActivityRow {
  userId: string;
  name: string | null;
  branch: string | null;
  role: StaffRole;
  /** Kurumda etkin personel mi (pasif / listede olmayan kişi yalnız penceredeki işlemi varsa görünür). */
  active: boolean;
  /** Rehber öğretmen: en az bir öğrenciye rehber atanmış (`student_guidance_assignments`) ya da branşı rehberlik / PDR. */
  guidance: boolean;
  cells: Record<StaffColumn, StaffCell>;
  /** Penceredeki tüm işlemler birlikte: farklı gün (RPC `total`). */
  activeDays: number;
  /** Penceredeki toplam işlem (sessions toplamı; mobil / web oturumu ve onaylanan görev hariç — "önemli işlem" sayısı). */
  actions: number;
  lastDay: string | null;
}

export interface StaffActivityResponse {
  /** Pencere (gün); `STAFF_WINDOW_ALL` (0) = Tümü. */
  windowDays: number;
  since: string;
  until: string;
  rows: StaffActivityRow[];
}

function emptyCell(): StaffCell {
  return { events: 0, sessions: 0, days: 0 };
}

function emptyCells(): Record<StaffColumn, StaffCell> {
  return Object.fromEntries(STAFF_COLUMNS.map((c) => [c, emptyCell()])) as Record<StaffColumn, StaffCell>;
}

/** Hücrede gösterilen ölçü. Verilen / onaylanan / onaya yollanan ödev kayıt sayısını gösterir; diğerleri işlem / oturum. */
const COLUMN_METRIC: Record<StaffColumn, "sessions" | "events"> = {
  attendance: "sessions",
  lessonTopic: "sessions",
  assignmentCreated: "events",
  assignment: "sessions",
  reviewApproved: "events",
  guidanceAwaiting: "events",
  privateLesson: "sessions",
  exam: "sessions",
  announcement: "sessions",
  sms: "sessions",
  mobile: "sessions",
  web: "sessions",
  students: "events",
  studentsWithHomework: "events",
  analysisViews: "events",
  homeworkViews: "events",
  examDownloads: "events",
  homeworkPdfs: "events",
};

/** Kartın, CSV'nin ve mobil kartın gösterdiği sayı. */
export function cellValue(row: StaffActivityRow, column: StaffColumn): number {
  return row.cells[column][COLUMN_METRIC[column]];
}

const ACTION_TO_COLUMNS = new Map<string, StaffColumn[]>();
for (const c of STAFF_COLUMNS) {
  for (const a of COLUMN_SOURCES[c]) ACTION_TO_COLUMNS.set(a, [...(ACTION_TO_COLUMNS.get(a) ?? []), c]);
}

function toRole(role: string | null | undefined): StaffRole {
  return role === "admin" ? "admin" : role === "teacher" ? "teacher" : "other";
}

/** Branş metninden rehber mi ("Rehberlik", "Rehber Öğretmen", "PDR", "Psikolojik Danışman"). */
export function isGuidanceBranch(branch: string | null | undefined): boolean {
  const text = (branch ?? "").toLocaleLowerCase("tr-TR");
  return /rehber|\bpdr\b|psikolojik dan/.test(text);
}

/**
 * RPC satırları + kurum personeli + profiller → kart satırları.
 *  - Etkin personelin HEPSİ görünür (işlemi olmayan 0 ile, altta).
 *  - Pasif ya da personel listesinde olmayan kişi yalnız penceredeki işlemi varsa görünür.
 *  - Sıra: önce rehberler (alt alta), sonra diğerleri; grup içinde aktif gün ↓, işlem ↓, ad (tr) ↑.
 */
export function buildStaffActivityRows(
  rpcRows: readonly StaffActivityRpcRow[],
  staff: readonly StaffMember[],
  profiles: readonly StaffProfile[],
  /** Öğrenciye rehber atanmış personel (`student_guidance_assignments.teacher_id`). */
  guidanceTeacherIds: ReadonlySet<string> = new Set()
): StaffActivityRow[] {
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const rows = new Map<string, StaffActivityRow>();

  const ensure = (userId: string, member?: StaffMember): StaffActivityRow => {
    let row = rows.get(userId);
    if (!row) {
      const profile = profileById.get(userId);
      row = {
        userId,
        name: profile?.fullName?.trim() || null,
        branch: profile?.branch?.trim() || null,
        role: toRole(member?.role),
        active: member?.active ?? false,
        guidance: guidanceTeacherIds.has(userId) || isGuidanceBranch(profile?.branch),
        cells: emptyCells(),
        activeDays: 0,
        actions: 0,
        lastDay: null,
      };
      rows.set(userId, row);
    }
    return row;
  };

  const memberById = new Map(staff.map((m) => [m.userId, m]));
  for (const m of staff) if (m.active) ensure(m.userId, m);

  for (const r of rpcRows) {
    if (!r.user_id) continue;
    const row = ensure(r.user_id, memberById.get(r.user_id));
    if (r.action === "total") {
      row.activeDays = r.active_days;
      row.lastDay = r.last_day;
      continue;
    }
    const columns = ACTION_TO_COLUMNS.get(r.action);
    if (!columns) continue; // RPC'ye yeni işlem eklendiyse kart onu yok sayar (sözleşme genişlemesi kırmaz)
    for (const column of columns) {
      const cell = row.cells[column];
      cell.events += r.event_count;
      cell.sessions += r.session_count;
      cell.days = Math.max(cell.days, r.active_days);
    }
    // RPC satırı başına BİR kez (birleşik sütunlar da işlemi bir kez katar).
    if (!columns.some((c) => NOT_AN_ACTION.has(c))) row.actions += r.session_count;
  }

  return [...rows.values()].sort(
    (a, b) =>
      Number(b.guidance) - Number(a.guidance) ||
      b.activeDays - a.activeDays ||
      b.actions - a.actions ||
      (a.name ?? "￿").localeCompare(b.name ?? "￿", "tr")
  );
}

/** Penceredeki etkin personelden hiç işlemi (mobil dahil) olmayanların sayısı. */
export function idleStaffCount(rows: readonly StaffActivityRow[]): number {
  return rows.filter((r) => r.active && r.activeDays === 0).length;
}

// --- Pencere ---------------------------------------------------------------------------------------

/** "Tümü" penceresi (sınır yok). Edoras RPC 338'den beri pencere sınırı koymuyor. */
export const STAFF_WINDOW_ALL = 0;
export const STAFF_WINDOW_OPTIONS = [7, 30, 90, STAFF_WINDOW_ALL] as const;
/** "Tümü"nün başlangıcı: Edoras'taki ilk kurumdan (2026-07) önce — kurum verisinin hepsini kapsar. */
export const STAFF_ALL_SINCE = "2026-01-01";

/** Bilinmeyen pencere → varsayılan. "0" = Tümü. */
export function parseStaffWindow(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return DEFAULT_WINDOW_DAYS;
  const n = Number(value);
  return (STAFF_WINDOW_OPTIONS as readonly number[]).includes(n) ? n : DEFAULT_WINDOW_DAYS;
}
