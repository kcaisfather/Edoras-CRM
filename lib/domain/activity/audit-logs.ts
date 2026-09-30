/**
 * Aktivite geçmişi → "CRM işlem kaydı" (crm_audit_logs) okuma tipleri ve süzgeç şeması. Saf; testler audit-logs.test.ts.
 * Kayıtlar yalnız eklenir (veritabanında değiştirilemez); burada yalnız okunur.
 */
import { z } from "zod";
import { isIsoDate } from "@/lib/domain/institutions/rules";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "./audit-actions";

export type AuditDetailValue = string | number | boolean | null;

export interface AuditLogEntry {
  id: number;
  /** ISO zaman damgası. */
  at: string;
  actorId: string | null;
  actorName: string | null;
  /** Bilinen eylem kodu; listede olmayan (eski / gelecek) kod ham gelir. */
  action: string;
  entityType: string;
  entityId: string | null;
  entityLabel: string | null;
  /** Kişisel veri içermez (yazarken engellenir); okurken de kısaltılır ve yalnız düz değerler geçer. */
  details: Record<string, AuditDetailValue>;
}

export interface AuditLogPage {
  items: AuditLogEntry[];
  total: number;
  page: number;
  size: number;
}

export const AUDIT_PAGE_SIZES = [10, 20, 50, 100] as const;
const MAX_DETAIL_KEYS = 20;
const MAX_DETAIL_TEXT = 200;

/**
 * `details` jsonb'sini ekrana güvenli hâle getirir: yalnız düz değerler (metin / sayı / evet-hayır / boş), en çok 20 anahtar,
 * metinler 200 karakter. İç içe nesne / dizi atılır. Ekran bunu düz METİN olarak çizer (HTML olarak asla).
 */
export function sanitizeAuditDetails(raw: unknown): Record<string, AuditDetailValue> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const out: Record<string, AuditDetailValue> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (Object.keys(out).length >= MAX_DETAIL_KEYS) break;
    if (value === null || typeof value === "boolean") out[key] = value;
    else if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
    else if (typeof value === "string") out[key] = value.length > MAX_DETAIL_TEXT ? `${value.slice(0, MAX_DETAIL_TEXT)}…` : value;
  }
  return out;
}

const dateParam = z
  .string()
  .optional()
  .transform((v) => (isIsoDate(v) ? v : undefined));

/** GET /api/activity/audit-logs süzgeci; bozuk değerler süzgeç dışı sayılır. */
export const auditLogsQuerySchema = z.object({
  actorId: z.uuid().optional().catch(undefined),
  action: z.enum(AUDIT_ACTIONS).optional().catch(undefined),
  entityType: z.enum(AUDIT_ENTITY_TYPES).optional().catch(undefined),
  from: dateParam,
  to: dateParam,
  page: z.coerce.number().int().min(0).max(1_000_000).catch(0),
  size: z.coerce.number().int().min(1).max(100).catch(20),
});
export type AuditLogsQuery = z.output<typeof auditLogsQuerySchema>;
