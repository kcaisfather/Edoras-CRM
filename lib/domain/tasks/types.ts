/**
 * Görev tipleri — API yanıtı (GET /api/crm/tasks) ve ekranlar bu şekilleri paylaşır.
 * Tablo: crm_tasks (supabase/migrations/20260929170000_crm_tasks.sql).
 */
import type { TaskKind } from "./rules";

/** Görev sonucu (SQL: crm_tasks_outcome_check). DeepSport'taki `[GOREV|kural|sonuç]` notunun sonuç alanı. */
export const TASK_OUTCOMES = ["ulasildi", "ulasilamadi", "tekrar", "ilgilenmiyor"] as const;
export type TaskOutcome = (typeof TASK_OUTCOMES)[number];

/** "Görev ata" → Amaç (SQL: crm_tasks_assignment_type_check). */
export const ASSIGNMENT_TYPES = ["arama", "anket", "yenileme", "tahsilat", "demo", "teklif", "diger"] as const;
export type AssignmentType = (typeof ASSIGNMENT_TYPES)[number];

/** Kural görevleri TaskKind; elle atananlar "assigned". */
export type CrmTaskKind = TaskKind | "assigned";

export type TaskStatus = "OPEN" | "DONE";

/**
 * GET /api/crm/tasks satırı. Açık kural görevleri sunucuda her istekte türetilir (saklanmaz); tamamlananlar ve
 * elle atananlar crm_tasks'tan gelir. Tutar taşımaz (bakiye görevinin tutarı ekranda adaydan, yalnız finans
 * yetkisiyle okunur). Takvim günleri YYYY-MM-DD (Türkiye), zaman damgaları epoch ms.
 */
export interface CrmTaskDto {
  /** Ekrandaki kimlik: elle atanan görevde satır id'si, kural görevinde anahtar. */
  id: string;
  /** crm_tasks satırı; açık kural görevinde null. Geri al bu id ile yapılır. */
  taskId: string | null;
  /** Kural görevinin anahtarı `${kind}:${özne}:${vade}`; elle atananda null. */
  key: string | null;
  kind: CrmTaskKind;
  /** Görevin adayı: aday kurallarında özne; kurum kurallarında kurumun bağlı adayı (varsa). */
  leadId: string | null;
  /** Yalnız kurum kurallarında (demoEnding, annualRenewal, expired): Edoras institutions.id. */
  institutionId: string | null;
  dueDate: string;
  /** Kurala özgü bağlam günü: teklif tarihi, demo / lisans bitişi, son güncelleme… */
  refDate: string | null;
  status: TaskStatus;
  assigneeId: string | null;
  assigneeName: string | null;
  /** Yalnız elle atanan: amaç ve atayanın notu. */
  type: AssignmentType | null;
  note: string | null;
  outcome: TaskOutcome | null;
  /** Tamamlarken yazılan sonuç notu. */
  resultNote: string | null;
  completedAt: number | null;
  completedBy: string | null;
  completedByName: string | null;
  createdBy: string | null;
  createdByName: string | null;
}

/** Görev atanabilecek kişi (GET /api/crm/tasks/assignees). */
export interface TeamMember {
  id: string;
  name: string;
}
