/**
 * Madde 11 — "Görevlerim" (DeepSportAdmin features/tasks/derive.ts'ten). Zamanlayıcı olmadığı için açık kural
 * görevleri SUNUCUDA her istekte adaylardan, kurum kayıtlarından, lisanslardan, ödemelerden ve kurallardan
 * türetilir (lib/server/crm-tasks.ts); veritabanına yalnız tamamlananlar ve elle atananlar yazılır. Saf fonksiyonlar.
 *
 * Görev anahtarı `${tür}:${özne id}:${vade}` — vade değişirse (ör. yeni arama tarihi yazıldı, kayıt güncellendi)
 * yeni bir görev doğar, eskisinin tamamlanma kaydı ona taşınmaz. Özne aday kurallarında aday, kurum kurallarında
 * kurumdur (INSTITUTION_RULES).
 *
 * Takvim günleri YYYY-MM-DD (Türkiye); `today` çağıran tarafından verilir (todayIso). Yaklaşan pencere 14 gün;
 * gecikmiş görev tamamlanana kadar listede kalır (DeepSport ile aynı).
 */

import { addDays, daysBetween, todayIso } from "@/lib/domain/institutions/rules";
import type { CrmStatus } from "@/lib/domain/crm/types";
import { isInstitutionRule, isTaskKind, ruleMap, type RuleConfig, type TaskKind } from "./rules";
import type { AssignmentType, CrmTaskDto, CrmTaskKind, TaskOutcome, TaskStatus } from "./types";

export const UPCOMING_WINDOW_DAYS = 14;
/** Demo bittikten sonra "Demo bitiyor" görevinin açık kaldığı ek gün (DeepSport DEMO_GRACE_DAYS). */
export const DEMO_GRACE_DAYS = 2;
/** "Süresi doldu": bitişi en çok bu kadar gün önce olanlar (DeepSport RENEWAL_EXPIRED_LOOKBACK_DAYS). */
export const EXPIRED_LOOKBACK_DAYS = 90;
/** Tamamlanan görevler bu kadar gün listede kalır ("Tamamlananları göster", "Geri al"). */
export const DONE_RECENT_DAYS = 90;

// --- Girdi ----------------------------------------------------------------------------------------

export interface TaskLeadInput {
  id: string;
  status: CrmStatus;
  nextFollowUpAt: string | null;
  offerSentAt: string | null;
  /** Son güncellemenin Türkiye takvim günü. */
  updatedOn: string;
  institutionId: string | null;
  saleAmount: number | null;
}

export interface TaskInstitutionInput {
  institutionId: string;
  status: "DEMO" | "UCRETLI";
  demoEndsAt: string | null;
  /** Lisansların en geç bitişi (yenileme varsa yenilemenin bitişi). */
  licenseEndsOn: string | null;
}

/** Kurumun tahsilatı (crm_payments): toplam ve son ödeme günü. */
export interface CollectionSummary {
  collected: number;
  lastPaidOn: string | null;
}

export interface DeriveInput {
  leads: readonly TaskLeadInput[];
  institutions: readonly TaskInstitutionInput[];
  collections: ReadonlyMap<string, CollectionSummary>;
  /** İç / sunum kurumları (crm_internal_institutions): görev üretmez. */
  internal: ReadonlySet<string>;
  /** Açık elle atanmış görevi olan adaylar ("Tarihsiz takip" onlarda üretilmez). */
  openAssignedLeadIds: ReadonlySet<string>;
}

export interface DerivedTask {
  key: string;
  kind: TaskKind;
  /** Aday kurallarında özne; kurum kurallarında kurumun bağlı adayı (yoksa null). */
  leadId: string | null;
  /** Yalnız kurum kurallarında. */
  institutionId: string | null;
  dueDate: string;
  refDate: string | null;
}

// --- Anahtar --------------------------------------------------------------------------------------

export const taskKey = (kind: TaskKind, subjectId: string, dueDate: string): string => `${kind}:${subjectId}:${dueDate}`;

const KEY = /^([A-Za-z]+):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):(\d{4}-\d{2}-\d{2})$/;

/** Anahtarı parçalarına ayırır; biçim ya da tür geçersizse null. */
export function parseTaskKey(key: string): { kind: TaskKind; subjectId: string; dueDate: string } | null {
  const m = KEY.exec(key);
  if (!m || !isTaskKind(m[1])) return null;
  return { kind: m[1], subjectId: m[2], dueDate: m[3] };
}

// --- Türetme --------------------------------------------------------------------------------------

const later = (a: string, b: string | null | undefined): string => (b && b > a ? b : a);

/** Açık bakiye: satış − bağlı kurumun tahsilatı (tutar görevde taşınmaz, yalnız koşul). */
function hasBalance(lead: TaskLeadInput, pay: CollectionSummary | undefined): boolean {
  return (lead.saleAmount ?? 0) - (pay?.collected ?? 0) > 0;
}

function deriveLeadTasks(input: DeriveInput, r: Record<TaskKind, RuleConfig>, push: (t: Omit<DerivedTask, "key">, subject: string) => void) {
  for (const lead of input.leads) {
    if (lead.institutionId && input.internal.has(lead.institutionId)) continue;
    const status = lead.status;
    const at = (kind: TaskKind, due: string, refDate: string | null) =>
      push({ kind, leadId: lead.id, institutionId: null, dueDate: due, refDate }, lead.id);

    // 1) Elle planlanan arama tarihi — satış olmuş müşteride eski takip tarihi görev üretmez.
    if (r.scheduled.enabled && lead.nextFollowUpAt && status !== "SATIS_OLDU") at("scheduled", lead.nextFollowUpAt, null);

    // 2) Teklif verildi + N gün (planlanmış arama tarihi varsa o görev yeterli).
    if (r.offer.enabled && status === "TEKLIF_VERILDI" && !lead.nextFollowUpAt) {
      const base = lead.offerSentAt ?? lead.updatedOn;
      at("offer", addDays(base, r.offer.days), base);
    }

    // 3) Satış olmadı → N gün sonra yeniden temas (planlanmış tarih yoksa).
    if (r.lostRecontact.enabled && status === "OLUMSUZ" && !lead.nextFollowUpAt) {
      at("lostRecontact", addDays(lead.updatedOn, r.lostRecontact.days), lead.updatedOn);
    }

    // Aşağıdakiler eski Arama Kuyruğu nedenleri; "Satış olmadı" kayıtları hariç.
    if (status === "OLUMSUZ") continue;

    // 4) Tarihsiz "Aranacak" / "Takipte": planlanmış tarih ya da açık elle atanmış görev yoksa son güncellemeden
    // N gün sonra ara. Statü değişince ya da tarih planlanınca görev düşer.
    if (
      r.undatedFollowUp.enabled &&
      (status === "ARANACAK" || status === "TAKIPTE") &&
      !lead.nextFollowUpAt &&
      !input.openAssignedLeadIds.has(lead.id)
    ) {
      at("undatedFollowUp", addDays(lead.updatedOn, r.undatedFollowUp.days), lead.updatedOn);
    }

    // 5) Açık bakiye: son güncelleme ya da son tahsilattan (hangisi geçse) N gün sonra tahsilat araması.
    // Tahsilat girilince vade ileri kayar; bakiye kapanınca görev düşer.
    const pay = lead.institutionId ? input.collections.get(lead.institutionId) : undefined;
    if (r.balance.enabled && hasBalance(lead, pay)) {
      const base = later(lead.updatedOn, pay?.lastPaidOn);
      at("balance", addDays(base, r.balance.days), base);
    }
  }
}

function deriveInstitutionTasks(
  input: DeriveInput,
  r: Record<TaskKind, RuleConfig>,
  today: string,
  push: (t: Omit<DerivedTask, "key">, subject: string) => void
) {
  const leadOf = new Map(input.leads.filter((l) => l.institutionId).map((l) => [l.institutionId as string, l]));
  for (const inst of input.institutions) {
    if (input.internal.has(inst.institutionId)) continue;
    const lead = leadOf.get(inst.institutionId) ?? null;
    // Kaybedilen müşteri: yeniden temas kuralı devralır.
    if (lead?.status === "OLUMSUZ") continue;
    const at = (kind: TaskKind, due: string, refDate: string) =>
      push({ kind, leadId: lead?.id ?? null, institutionId: inst.institutionId, dueDate: due, refDate }, inst.institutionId);
    const end = inst.status === "DEMO" ? inst.demoEndsAt : inst.licenseEndsOn;
    if (!end) continue;
    // Aralık [başlangıç, bitiş): bitiş günü demo / lisans bitmiştir (left ≤ 0).
    const left = daysBetween(today, end);

    // 6) Demo bitişine N gün kala (demo 1 yıl); bitişten sonra kısa bir süre daha açık kalır.
    if (inst.status === "DEMO" && r.demoEnding.enabled && left >= -DEMO_GRACE_DAYS) {
      at("demoEnding", addDays(end, -r.demoEnding.days), end);
    }
    // 7) Yıllık lisans bitişine N gün kala (lisans sürerken). Yenileme girilirse en geç bitiş ileri kayar.
    if (inst.status === "UCRETLI" && r.annualRenewal.enabled && left > 0) {
      at("annualRenewal", addDays(end, -r.annualRenewal.days), end);
    }
    // 8) Süresi doldu: demo bitti ve ücretliye geçmedi / lisans bitti ve yenilenmedi → bitişten N gün sonra.
    if (r.expired.enabled && left <= 0 && left >= -EXPIRED_LOOKBACK_DAYS) {
      at("expired", addDays(end, r.expired.days), end);
    }
  }
}

/**
 * Açık kural görevleri (tamamlanmışlar dahil — ayıklama `mergeTasks`'ta). Anket ve soğuk liste kuralları
 * modülleri taşınana kadar görev üretmez. Sıra: vade, sonra anahtar.
 */
export function deriveTasks(input: DeriveInput, rules: RuleConfig[], today: string): DerivedTask[] {
  const r = ruleMap(rules);
  const out: DerivedTask[] = [];
  const push = (t: Omit<DerivedTask, "key">, subject: string) => out.push({ key: taskKey(t.kind, subject, t.dueDate), ...t });
  deriveLeadTasks(input, r, push);
  deriveInstitutionTasks(input, r, today, push);
  return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.key.localeCompare(b.key));
}

// --- Saklı görevlerle birleştirme -----------------------------------------------------------------

/** crm_tasks satırı (sunucu okur). */
export interface StoredTask {
  id: string;
  kind: CrmTaskKind;
  leadId: string | null;
  institutionId: string | null;
  dueDate: string;
  status: TaskStatus;
  assigneeId: string | null;
  type: AssignmentType | null;
  key: string | null;
  note: string | null;
  outcome: TaskOutcome | null;
  resultNote: string | null;
  completedAt: number | null;
  completedBy: string | null;
  createdBy: string | null;
}

export interface Viewer {
  id: string;
  isAdmin: boolean;
}

/**
 * Görünürlük: kural görevleri ve atanmamış görevler ekip havuzudur (herkes görür); atanmış görev yalnız atanan
 * kişiye ve yöneticiye görünür.
 */
export function canSeeTask(task: Pick<CrmTaskDto, "kind" | "assigneeId">, viewer: Viewer): boolean {
  return viewer.isAdmin || task.kind !== "assigned" || !task.assigneeId || task.assigneeId === viewer.id;
}

const nameOf = (names: ReadonlyMap<string, string>, id: string | null) => (id ? (names.get(id) ?? null) : null);

function fromStored(s: StoredTask, names: ReadonlyMap<string, string>, extra: Partial<CrmTaskDto> = {}): CrmTaskDto {
  return {
    id: s.kind === "assigned" ? s.id : (s.key ?? s.id),
    taskId: s.id,
    key: s.key,
    kind: s.kind,
    leadId: s.leadId,
    institutionId: s.institutionId,
    dueDate: s.dueDate,
    refDate: null,
    status: s.status,
    assigneeId: s.assigneeId,
    assigneeName: nameOf(names, s.assigneeId),
    type: s.type,
    note: s.note,
    outcome: s.outcome,
    resultNote: s.resultNote,
    completedAt: s.completedAt,
    completedBy: s.completedBy,
    completedByName: nameOf(names, s.completedBy),
    createdBy: s.createdBy,
    createdByName: nameOf(names, s.createdBy),
    ...extra,
  };
}

/**
 * Türetilen görevler + crm_tasks satırları → ekran satırları. Anahtarı DONE satırı olan kural görevi
 * "tamamlandı" olur; koşulu artık oluşmayan tamamlanmış kural görevi de (tarihçe) listede kalır — kurum
 * görevinin adayı güncel bağlantıdan (`leadOfInstitution`) okunur.
 */
export function mergeTasks(
  derived: readonly DerivedTask[],
  stored: readonly StoredTask[],
  ctx: { names: ReadonlyMap<string, string>; leadOfInstitution: ReadonlyMap<string, string> }
): CrmTaskDto[] {
  const doneByKey = new Map(stored.filter((s) => s.key).map((s) => [s.key as string, s]));
  const seen = new Set<string>();
  const out: CrmTaskDto[] = [];
  for (const d of derived) {
    seen.add(d.key);
    const done = doneByKey.get(d.key);
    if (done) {
      out.push(fromStored(done, ctx.names, { leadId: d.leadId, institutionId: d.institutionId, refDate: d.refDate }));
      continue;
    }
    out.push({
      id: d.key,
      taskId: null,
      key: d.key,
      kind: d.kind,
      leadId: d.leadId,
      institutionId: d.institutionId,
      dueDate: d.dueDate,
      refDate: d.refDate,
      status: "OPEN",
      assigneeId: null,
      assigneeName: null,
      type: null,
      note: null,
      outcome: null,
      resultNote: null,
      completedAt: null,
      completedBy: null,
      completedByName: null,
      createdBy: null,
      createdByName: null,
    });
  }
  for (const s of stored) {
    if (s.key && seen.has(s.key)) continue;
    const lead = s.institutionId && isInstitutionRule(s.kind) ? (ctx.leadOfInstitution.get(s.institutionId) ?? null) : s.leadId;
    out.push(fromStored(s, ctx.names, { leadId: lead }));
  }
  return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id));
}

export interface TaskFilter {
  viewer: Viewer;
  today: string;
  /** Vade alt sınırı; yoksa gecikmiş açık görevler (tamamlanana kadar) hep listelenir. */
  from?: string | null;
  /** Vade üst sınırı (varsayılan: bugün + 14). */
  to: string;
  status?: TaskStatus | null;
}

/** Tamamlanan görev son DONE_RECENT_DAYS gün içinde mi tamamlandı. */
function recentlyDone(t: CrmTaskDto, today: string): boolean {
  if (t.completedAt == null) return false;
  return todayIso(new Date(t.completedAt)) >= addDays(today, -DONE_RECENT_DAYS);
}

export function filterTasks(tasks: readonly CrmTaskDto[], f: TaskFilter): CrmTaskDto[] {
  return tasks.filter(
    (t) =>
      canSeeTask(t, f.viewer) &&
      t.dueDate <= f.to &&
      (!f.from || t.dueDate >= f.from) &&
      (!f.status || t.status === f.status) &&
      (t.status === "OPEN" || recentlyDone(t, f.today))
  );
}

/**
 * Kenar çubuğu rozeti: vadesi bugün olan ya da geçmiş açık görev sayısı (Görevlerim'deki "Gecikmiş" + "Bugün"
 * açık sayılarının toplamı). Görünürlük süzgeci çağıranın işidir.
 */
export function countDueOpenTasks(tasks: readonly Pick<CrmTaskDto, "status" | "dueDate">[], today: string): number {
  let n = 0;
  for (const t of tasks) if (t.status === "OPEN" && t.dueDate <= today) n++;
  return n;
}

// --- Ekran gruplaması -----------------------------------------------------------------------------

export interface TaskBuckets<T> {
  overdue: T[];
  today: T[];
  upcoming: T[];
}

/** Gecikmiş (vade < bugün), bugün, yaklaşan (1–14 gün). Daha ilerisi listelenmez. */
export function bucketTasks<T extends { dueInDays: number }>(tasks: readonly T[], windowDays = UPCOMING_WINDOW_DAYS): TaskBuckets<T> {
  const out: TaskBuckets<T> = { overdue: [], today: [], upcoming: [] };
  for (const t of tasks) {
    if (t.dueInDays < 0) out.overdue.push(t);
    else if (t.dueInDays === 0) out.today.push(t);
    else if (t.dueInDays <= windowDays) out.upcoming.push(t);
  }
  return out;
}
