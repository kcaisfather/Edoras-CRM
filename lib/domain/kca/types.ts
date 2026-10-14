/**
 * Yönetim (KCA Panel) — tipler ve API gövde şemaları (tek kaynak: istemci formları ve sunucu uçları).
 *
 * Veri EdorasCRM'de DEĞİL, KCA Panel'in Turso veritabanındadır (kca-panel.vercel.app ile aynı tablolar: tasks, meetings,
 * contacts…). CRM yalnız Edoras etiketli kayıtları görür ve yazar: kökü "Edoras" ana projesi olan projeler (Edoras + alt
 * projeleri). Yetki KCA Panel'in kuralıdır (proje üyeliği, toplantı sahipliği, kişiye özel network); CRM personeli kendi
 * KCA Panel hesabını şifresiyle bağlar (crm_kca_links). Ayrıntı: docs/memory/EdorasCRM/modules/management-kca.md.
 * Kimlikler KCA Panel'in tamsayı kimlikleridir.
 */
import { z } from "zod";

export const KCA_TASK_STATUSES = ["todo", "doing", "blocked", "review", "done"] as const;
export type KcaTaskStatus = (typeof KCA_TASK_STATUSES)[number];

export const KCA_PRIORITIES = ["low", "normal", "high"] as const;
export type KcaPriority = (typeof KCA_PRIORITIES)[number];

export const KCA_CONTACT_STATUSES = ["todo", "followup", "done"] as const;
export type KcaContactStatus = (typeof KCA_CONTACT_STATUSES)[number];

export const KCA_MEETING_STATUSES = ["planned", "held"] as const;
export type KcaMeetingStatus = (typeof KCA_MEETING_STATUSES)[number];

/** KCA Panel'in alan sınırları (lib/actions.js) — iki panel aynı veriyi yazdığı için birebir aynı. */
export const KCA_LIMITS = {
  taskTitle: 300,
  taskSubject: 120,
  taskDescription: 5000,
  comment: 4000,
  meetingTitle: 200,
  meetingParticipants: 1000,
  meetingBody: 50000,
  result: 4000,
  contactName: 120,
  contactOrganization: 160,
  contactReferral: 160,
  contactAction: 1000,
  contactNotes: 5000,
  contactPhone: 40,
  contactEmail: 200,
} as const;

/** Edoras kapsamındaki bir KCA projesi + oturumdaki kişinin o projedeki yetkileri (yönetici: hepsi). */
export interface KcaProjectDto {
  id: number;
  name: string;
  color: string;
  /** null = Edoras ana projesi; dolu = Edoras'ın alt projesi. */
  parentId: number | null;
  archived: boolean;
  canCreateTasks: boolean;
  canEditDueDates: boolean;
}

export interface KcaMemberDto {
  projectId: number;
  id: number;
  name: string;
  active: boolean;
}

export interface KcaUserDto {
  id: number;
  name: string;
  email: string;
  isAdmin: boolean;
}

/**
 * GET /api/management/session — ekranın ilk sorusu.
 *   NOT_CONFIGURED: sunucuda KCA_TURSO_DATABASE_URL yok.
 *   NOT_LINKED: personel KCA Panel hesabını bağlamamış ya da bağ düşmüş (şifre değişti / hesap pasif).
 *   NO_SCOPE: KCA Panel'de "Edoras" ana projesi bulunamadı (ya da birden çok) → hiçbir şey gösterilmez.
 *   READY: Edoras projeleri (yalnız kişinin gördükleri), üyeler, bugün (İstanbul).
 */
export type KcaSessionDto =
  | { state: "NOT_CONFIGURED" }
  | { state: "NOT_LINKED"; reason: "NONE" | "PASSWORD_CHANGED" | "INACTIVE" }
  | { state: "NO_SCOPE"; user: KcaUserDto }
  | { state: "READY"; user: KcaUserDto; projects: KcaProjectDto[]; members: KcaMemberDto[]; today: string };

export interface KcaTaskDto {
  id: number;
  projectId: number;
  projectName: string;
  projectColor: string;
  subject: string | null;
  title: string;
  description: string | null;
  assigneeId: number | null;
  assigneeName: string | null;
  status: KcaTaskStatus;
  priority: KcaPriority;
  dueDate: string | null;
  meetingId: number | null;
  createdById: number | null;
  /** KCA Panel saatleri UTC "YYYY-MM-DD HH:MM:SS". */
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  commentCount: number;
}

export interface KcaTaskCommentDto {
  id: number;
  body: string;
  createdAt: string;
  userName: string | null;
}

export interface KcaTaskEventDto {
  kind: string;
  /** Sorumlu değişikliğinde kimlik yerine kişinin adı (sunucuda çözülür). */
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
  userName: string | null;
}

export interface KcaTaskDetailDto {
  task: KcaTaskDto & { createdByName: string | null };
  perms: { canCreateTasks: boolean; canEditDueDates: boolean; isAssignee: boolean };
  comments: KcaTaskCommentDto[];
  events: KcaTaskEventDto[];
  /** Projenin aktif üyeleri (sorumlu seçenekleri). */
  members: { id: number; name: string }[];
}

export interface KcaMeetingDto {
  id: number;
  ownerId: number;
  ownerName: string | null;
  isOwner: boolean;
  projectId: number;
  projectName: string;
  projectColor: string;
  title: string;
  meetingDate: string;
  participants: string | null;
  body: string;
  status: KcaMeetingStatus;
  /** Proje ekibi de görür. */
  shared: boolean;
  /** AI ekip (KCA Panel ürün yöneticisi) görev ve kişileri çıkarsın. */
  ai: boolean;
  source: string | null;
  processedAt: string | null;
  processedByName: string | null;
  result: string | null;
  createdAt: string;
  updatedAt: string;
  /** Toplantıdan çıkan, kişinin gördüğü Edoras görevleri. */
  taskCount: number;
}

export interface KcaMeetingDetailDto {
  meeting: KcaMeetingDto;
  tasks: KcaTaskDto[];
}

export interface KcaContactDto {
  id: number;
  name: string;
  organization: string | null;
  referral: string | null;
  projectId: number;
  projectName: string;
  projectColor: string;
  action: string | null;
  status: KcaContactStatus;
  nextDate: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  source: string | null;
  taskId: number | null;
  createdAt: string;
  updatedAt: string;
}

// ---------- gövde şemaları ----------

const MSG = { required: "Zorunlu alan", long: "Çok uzun", date: "Tarih geçersiz", email: "Geçerli bir e-posta girin" } as const;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const id = z.number().int().positive();
const requiredText = (max: number) => z.string().trim().min(1, MSG.required).max(max, MSG.long);
/**
 * Boş metin null olur (KCA Panel boş alanı NULL yazar). Bilerek `nullable` (undefined kabul etmez): kısmi güncellemede
 * `.optional()` ile sarılınca gövdede olmayan alan undefined kalır, null'a dönüp alanı silmez. Yeni kayıtta `.default(null)`.
 */
const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, MSG.long)
    .nullable()
    .transform((v) => (v ? v : null));
const ymd = z
  .string()
  .regex(DATE, MSG.date)
  .refine((v) => !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime()) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v, MSG.date);
const nullableDate = z
  .union([ymd, z.literal("")])
  .nullable()
  .transform((v) => (v ? v : null));

const L = KCA_LIMITS;

export const kcaLinkSchema = z.object({
  email: z.string().trim().min(1, MSG.required).max(200, MSG.long).regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, MSG.email),
  password: z.string().min(1, MSG.required).max(200, MSG.long),
});
export type KcaLinkInput = z.input<typeof kcaLinkSchema>;

export const kcaTaskCreateSchema = z.object({
  projectId: id,
  title: requiredText(L.taskTitle),
  subject: nullableText(L.taskSubject).default(null),
  description: nullableText(L.taskDescription).default(null),
  assigneeId: id.nullable().default(null),
  priority: z.enum(KCA_PRIORITIES).default("normal"),
  dueDate: nullableDate.default(null),
  meetingId: id.nullable().default(null),
});
export type KcaTaskCreateInput = z.input<typeof kcaTaskCreateSchema>;
export type KcaTaskCreateValues = z.output<typeof kcaTaskCreateSchema>;

/** Kısmi güncelleme: gövdede olmayan alana dokunulmaz (KCA Panel updateTask + moveTasks). */
export const kcaTaskPatchSchema = z
  .object({
    title: requiredText(L.taskTitle).optional(),
    subject: nullableText(L.taskSubject).optional(),
    description: nullableText(L.taskDescription).optional(),
    priority: z.enum(KCA_PRIORITIES).optional(),
    assigneeId: id.nullable().optional(),
    dueDate: nullableDate.optional(),
    status: z.enum(KCA_TASK_STATUSES).optional(),
    /** Edoras projeleri arasında taşıma. */
    projectId: id.optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: MSG.required });
export type KcaTaskPatchInput = z.input<typeof kcaTaskPatchSchema>;
export type KcaTaskPatchValues = z.output<typeof kcaTaskPatchSchema>;

export const kcaCommentSchema = z.object({ body: requiredText(L.comment) });
export const kcaApproveSchema = z.object({ note: nullableText(L.comment).default(null) });
export const kcaRequestChangesSchema = z.object({ note: requiredText(L.comment) });

const meetingFields = {
  title: requiredText(L.meetingTitle),
  date: ymd,
  participants: nullableText(L.meetingParticipants),
  body: requiredText(L.meetingBody),
  status: z.enum(KCA_MEETING_STATUSES),
  projectId: id,
  shared: z.boolean(),
  ai: z.boolean(),
};

/** Yeni toplantı notu: konu / tarih / katılanlar boşsa notun "Konu:", "Tarih:", "Katılanlar:" satırlarından okunur. */
export const kcaMeetingCreateSchema = z.object({
  body: meetingFields.body,
  projectId: meetingFields.projectId,
  title: nullableText(L.meetingTitle).default(null),
  date: nullableDate.default(null),
  participants: nullableText(L.meetingParticipants).default(null),
  status: meetingFields.status.nullable().default(null),
  shared: z.boolean().default(false),
  ai: z.boolean().default(true),
});
export type KcaMeetingCreateInput = z.input<typeof kcaMeetingCreateSchema>;
export type KcaMeetingCreateValues = z.output<typeof kcaMeetingCreateSchema>;

export const kcaMeetingPatchSchema = z
  .object({
    title: meetingFields.title.optional(),
    date: meetingFields.date.optional(),
    participants: meetingFields.participants.optional(),
    body: meetingFields.body.optional(),
    status: meetingFields.status.optional(),
    projectId: meetingFields.projectId.optional(),
    shared: meetingFields.shared.optional(),
    ai: meetingFields.ai.optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: MSG.required });
export type KcaMeetingPatchInput = z.input<typeof kcaMeetingPatchSchema>;
export type KcaMeetingPatchValues = z.output<typeof kcaMeetingPatchSchema>;

export const kcaMeetingProcessedSchema = z.object({ done: z.boolean(), result: nullableText(L.result).default(null) });

const contactFields = {
  name: requiredText(L.contactName),
  organization: nullableText(L.contactOrganization),
  referral: nullableText(L.contactReferral),
  projectId: id,
  action: nullableText(L.contactAction),
  status: z.enum(KCA_CONTACT_STATUSES),
  nextDate: nullableDate,
  phone: nullableText(L.contactPhone),
  email: nullableText(L.contactEmail),
  notes: nullableText(L.contactNotes),
};

export const kcaContactCreateSchema = z.object({
  name: contactFields.name,
  organization: contactFields.organization.default(null),
  referral: contactFields.referral.default(null),
  projectId: contactFields.projectId,
  action: contactFields.action.default(null),
  status: contactFields.status.default("todo"),
  nextDate: contactFields.nextDate.default(null),
  phone: contactFields.phone.default(null),
  email: contactFields.email.default(null),
  notes: contactFields.notes.default(null),
});
export type KcaContactCreateInput = z.input<typeof kcaContactCreateSchema>;
export type KcaContactCreateValues = z.output<typeof kcaContactCreateSchema>;

export const kcaContactPatchSchema = z
  .object({
    name: contactFields.name.optional(),
    organization: contactFields.organization.optional(),
    referral: contactFields.referral.optional(),
    projectId: contactFields.projectId.optional(),
    action: contactFields.action.optional(),
    status: contactFields.status.optional(),
    nextDate: contactFields.nextDate.optional(),
    phone: contactFields.phone.optional(),
    email: contactFields.email.optional(),
    notes: contactFields.notes.optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: MSG.required });
export type KcaContactPatchInput = z.input<typeof kcaContactPatchSchema>;
export type KcaContactPatchValues = z.output<typeof kcaContactPatchSchema>;
