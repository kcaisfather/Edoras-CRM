/**
 * Öğretmen kullanımı (kurum ayrıntısındaki "Öğretmen kullanımı" kartı) — saf şekillendirme; testler staff-activity.test.ts.
 *
 * Kaynak: Edoras RPC `staff_activity_summary(institution_id, since, until)` (edoras-admin migration 305). Satır =
 * (kişi, işlem türü) + kişi başına bir `total` satırı. Ölçüler:
 *   events   = kaynak kayıt sayısı (ödevde "1 görev = 1 test" yüzünden şişer)
 *   sessions = işlem: aynı kişi + aynı dakika = 1 (mobilde farklı oturum)
 *   days     = işlem yapılan farklı gün
 * Aktif gün işlemler arasında TOPLANAMAZ (aynı gün yoklama + ödev iki gün sayılır); kişinin genel aktif günü yalnız
 * `total` satırından gelir. Birleşik sütunlarda (Deneme, Birebir) gün = alt sınır (en büyük parça), işlem = toplam.
 */

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
] as const;
export type StaffRpcAction = (typeof STAFF_RPC_ACTIONS)[number];

/** Karttaki sütunlar (soldan sağa) ve hangi RPC işlemlerinden oluştukları. */
export const STAFF_COLUMNS = ["attendance", "assignment", "review", "privateLesson", "exam", "announcement", "sms", "lessonTopic", "mobile"] as const;
export type StaffColumn = (typeof STAFF_COLUMNS)[number];

const COLUMN_SOURCES: Record<StaffColumn, readonly StaffRpcAction[]> = {
  attendance: ["attendance"],
  assignment: ["assignment"],
  review: ["review"],
  privateLesson: ["private_lesson_series", "private_lesson_attendance"],
  exam: ["exam_created", "exam_published"],
  announcement: ["announcement"],
  sms: ["sms"],
  lessonTopic: ["lesson_topic"],
  mobile: ["mobile"],
};

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
  cells: Record<StaffColumn, StaffCell>;
  /** Penceredeki tüm işlemler birlikte: farklı gün (RPC `total`). */
  activeDays: number;
  /** Penceredeki toplam işlem (sessions toplamı; mobil hariç — "önemli işlem" sayısı). */
  actions: number;
  lastDay: string | null;
}

export interface StaffActivityResponse {
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

const ACTION_TO_COLUMN = new Map<string, StaffColumn>(
  STAFF_COLUMNS.flatMap((c) => COLUMN_SOURCES[c].map((a) => [a, c] as const))
);

function toRole(role: string | null | undefined): StaffRole {
  return role === "admin" ? "admin" : role === "teacher" ? "teacher" : "other";
}

/**
 * RPC satırları + kurum personeli + profiller → kart satırları.
 *  - Etkin personelin HEPSİ görünür (işlemi olmayan 0 ile, altta).
 *  - Pasif ya da personel listesinde olmayan kişi yalnız penceredeki işlemi varsa görünür.
 *  - Sıra: aktif gün ↓, işlem ↓, ad (tr) ↑.
 */
export function buildStaffActivityRows(
  rpcRows: readonly StaffActivityRpcRow[],
  staff: readonly StaffMember[],
  profiles: readonly StaffProfile[]
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
    const column = ACTION_TO_COLUMN.get(r.action);
    if (!column) continue; // RPC'ye yeni işlem eklendiyse kart onu yok sayar (sözleşme genişlemesi kırmaz)
    const cell = row.cells[column];
    cell.events += r.event_count;
    cell.sessions += r.session_count;
    cell.days = Math.max(cell.days, r.active_days);
    if (column !== "mobile") row.actions += r.session_count;
  }

  return [...rows.values()].sort(
    (a, b) =>
      b.activeDays - a.activeDays ||
      b.actions - a.actions ||
      (a.name ?? "￿").localeCompare(b.name ?? "￿", "tr")
  );
}

/** Penceredeki etkin personelden hiç işlemi (mobil dahil) olmayanların sayısı. */
export function idleStaffCount(rows: readonly StaffActivityRow[]): number {
  return rows.filter((r) => r.active && r.activeDays === 0).length;
}
