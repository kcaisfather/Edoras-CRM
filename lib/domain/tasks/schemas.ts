/**
 * Görev ve kural uçlarının gövde doğrulaması (tek kaynak: istemci ve sunucu). Aktör alanları (created_by,
 * completed_by, updated_by) şemada YOKTUR: sunucu oturumdan yazar. Kurallar veritabanında da zorunlu
 * (supabase/migrations/20260929170000_crm_tasks.sql).
 */
import { z } from "zod";
import { isIsoDate } from "@/lib/domain/institutions/rules";
import { CRM_STATUSES, LOST_REASONS } from "@/lib/domain/crm/types";
import { MAX_RULE_DAYS, TASK_KINDS } from "./rules";
import { parseTaskKey } from "./derive";
import { ASSIGNMENT_TYPES, TASK_OUTCOMES } from "./types";

const MSG = {
  date: "Geçerli bir tarih seçin",
  noteLong: "Not en fazla {max} karakter olabilir",
  key: "Görev anahtarı geçersiz",
  days: `0 ile ${MAX_RULE_DAYS} arasında bir tam sayı girin`,
} as const;

/** Atama notu (DeepSport NOTE_MAX). */
export const ASSIGN_NOTE_MAX = 500;
/** Sonuç notu (SQL: crm_tasks_note_check). */
export const RESULT_NOTE_MAX = 2000;

const isoDate = z.string().refine((v) => isIsoDate(v), MSG.date);
const note = (max: number) => z.string().trim().max(max, MSG.noteLong.replace("{max}", String(max)));

/** "Görev ata" — POST /api/crm/tasks. Vade bugün ya da sonrası (sunucu ve veritabanı da denetler). */
export const assignTaskSchema = z.object({
  leadId: z.uuid(),
  dueDate: isoDate,
  type: z.enum(ASSIGNMENT_TYPES),
  note: note(ASSIGN_NOTE_MAX).optional(),
  /** null / yok = ekip havuzu. CRM_AGENT yalnız kendini seçebilir (sunucu denetler). */
  assigneeId: z.uuid().nullable().optional(),
});
export type AssignTaskInput = z.input<typeof assignTaskSchema>;

/** Kural görevinin kimliği: anahtar + parçaları. Sunucu anahtarı parçalardan yeniden kurar ve görevi yeniden türetir. */
const derivedRef = z
  .object({
    key: z.string().max(200),
    kind: z.enum(TASK_KINDS),
    leadId: z.uuid().nullable(),
    institutionId: z.uuid().nullable(),
    dueDate: isoDate,
  })
  .refine((d) => {
    const p = parseTaskKey(d.key);
    return !!p && p.kind === d.kind && p.dueDate === d.dueDate;
  }, MSG.key);

const completionShape = {
  outcome: z.enum(TASK_OUTCOMES),
  /** Sonuç notu (başlık + metin); adayın notlarına da yazılır. */
  note: note(RESULT_NOTE_MAX).optional(),
  /** Yeni statü (isteğe bağlı; yalnız adayı olan görevde). */
  status: z.enum(CRM_STATUSES).nullable().optional(),
  /** Sonraki arama günü (isteğe bağlı; bugün ya da sonrası). */
  nextFollowUpAt: isoDate.nullable().optional(),
  lostReason: z.enum(LOST_REASONS).nullable().optional(),
};

/** POST /api/crm/tasks/complete — elle atanan görev `taskId` ile, kural görevi `derived` ile. */
export const completeTaskSchema = z.union([
  z.object({ taskId: z.uuid(), ...completionShape }),
  z.object({ derived: derivedRef, ...completionShape }),
]);
export type CompleteTaskInput = z.input<typeof completeTaskSchema>;
export type CompleteTaskValues = z.output<typeof completeTaskSchema>;

/** POST /api/crm/tasks/reopen — "Geri al". */
export const reopenTaskSchema = z.object({ taskId: z.uuid() });

/** PUT /api/crm/rules — tüm liste (bilinmeyen kural reddedilir; eksikler varsayılanla tamamlanır). */
export const rulesSchema = z
  .array(
    z.object({
      id: z.enum(TASK_KINDS),
      enabled: z.boolean(),
      days: z.number().int(MSG.days).min(0, MSG.days).max(MAX_RULE_DAYS, MSG.days),
    })
  )
  .max(TASK_KINDS.length * 2);

/** GET /api/crm/tasks sorgusu. */
export const taskQuerySchema = z.object({
  from: isoDate.nullable(),
  to: isoDate.nullable(),
  status: z.enum(["OPEN", "DONE"]).nullable(),
});
