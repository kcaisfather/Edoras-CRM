/**
 * Destek talebi (ticket) — tipler ve API gövde şemaları (tek kaynak: istemci formları ve sunucu uçları).
 * Tablolar: supabase/migrations/20261005160000_crm_tickets.sql. Aktör alanları (created_by, author) şemada YOKTUR:
 * gövdede gelirse atılır, sunucu oturumdan yazar. Talep eden bilgisi (ad, e-posta, telefon) KİŞİSEL VERİdir: işlem kaydına
 * yazılmaz.
 */
import { z } from "zod";

export const TICKET_STATUSES = ["OPEN", "PENDING", "RESOLVED"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_PRIORITIES = ["LOW", "NORMAL", "HIGH"] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const TICKET_SOURCES = ["STAFF", "PORTAL"] as const;
export type TicketSource = (typeof TICKET_SOURCES)[number];

export const TICKET_SUBJECT_MIN = 3;
export const TICKET_SUBJECT_MAX = 150;
export const TICKET_TEXT_MAX = 4000;

/** Müşteri formu gövdesi en çok bu kadar bayt (anket yanıtıyla aynı sınır). */
export const PUBLIC_TICKET_MAX_BYTES = 16 * 1024;

export interface TicketDto {
  id: string;
  /** İnsan okunur sıra numarası (#123). */
  number: number;
  institutionId: string;
  institutionName: string | null;
  subject: string;
  description: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  source: TicketSource;
  assigneeId: string | null;
  assigneeName: string | null;
  requesterName: string | null;
  requesterEmail: string | null;
  requesterPhone: string | null;
  noteCount: number;
  createdAt: number;
  updatedAt: number;
  resolvedAt: number | null;
}

export interface TicketNoteDto {
  id: string;
  authorId: string | null;
  authorName: string | null;
  body: string;
  createdAt: number;
}

export interface TicketDetailDto extends TicketDto {
  notes: TicketNoteDto[];
}

/** POST /api/crm/tickets/link/{institutionId}: kurumun destek bağlantısı (token); sayfa yolu /t/{token}. */
export interface TicketLinkDto {
  token: string;
  createdAt: number;
}

const MSG = { subject: "Konu 3–150 karakter olmalı", long: "Çok uzun", email: "Geçerli bir e-posta girin", name: "Ad soyad girin" } as const;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const subject = z.string().trim().min(TICKET_SUBJECT_MIN, MSG.subject).max(TICKET_SUBJECT_MAX, MSG.subject);
const text = z.string().trim().max(TICKET_TEXT_MAX, MSG.long);
const email = z
  .string()
  .trim()
  .max(254, MSG.long)
  .refine((v) => v === "" || EMAIL.test(v), MSG.email);

/** Ekibin açtığı talep. `assigneeId` boş = sorumlu atanmadı. */
export const ticketCreateSchema = z.object({
  institutionId: z.uuid(),
  subject,
  description: text.default(""),
  priority: z.enum(TICKET_PRIORITIES).default("NORMAL"),
  assigneeId: z.uuid().nullable().default(null),
  requesterName: z.string().trim().max(100, MSG.long).default(""),
  requesterEmail: email.default(""),
  requesterPhone: z.string().trim().max(30, MSG.long).default(""),
});
export type TicketCreateInput = z.input<typeof ticketCreateSchema>;
export type TicketCreateValues = z.output<typeof ticketCreateSchema>;

/** Kısmi güncelleme: gövdede olmayan alana dokunulmaz. */
export const ticketPatchSchema = z
  .object({
    subject,
    description: text,
    status: z.enum(TICKET_STATUSES),
    priority: z.enum(TICKET_PRIORITIES),
    assigneeId: z.uuid().nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "Değişiklik yok" });
export type TicketPatchInput = z.input<typeof ticketPatchSchema>;
export type TicketPatchValues = z.output<typeof ticketPatchSchema>;

export const ticketNoteSchema = z.object({ body: z.string().trim().min(1, "Not boş olamaz").max(TICKET_TEXT_MAX, MSG.long) });
export type TicketNoteInput = z.input<typeof ticketNoteSchema>;

export const ticketLinkSchema = z.object({ rotate: z.boolean().default(false) });

/**
 * Müşterinin herkese açık sayfadan gönderdiği talep. Ad zorunlu; e-posta ya da telefondan en az biri zorunlu. Kurum token'dan
 * belirlenir (gövdede kurum alanı YOK).
 */
export const publicTicketSchema = z
  .object({
    subject,
    description: text.default(""),
    name: z.string().trim().min(2, MSG.name).max(100, MSG.long),
    email: email.default(""),
    phone: z.string().trim().max(30, MSG.long).default(""),
  })
  .refine((v) => v.email !== "" || v.phone !== "", { path: ["email"], message: "E-posta ya da telefon girin" });
export type PublicTicketInput = z.input<typeof publicTicketSchema>;
export type PublicTicketValues = z.output<typeof publicTicketSchema>;

/** Müşteri sayfasının açılış verisi: yalnız kurum adı. */
export interface PublicTicketPage {
  institutionName: string;
}

