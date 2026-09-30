/**
 * Rapor uçlarının girdi şeması (sunucu; form aynı kuralları uygular). Veritabanı kısıtları
 * (crm_report_subscriptions_*) son savunmadır.
 */
import { z } from "zod";
import { parseTime } from "./schedule";
import { MAX_REPORT_RECIPIENTS, REPORT_FREQUENCIES, REPORT_SECTIONS, type ReportSection } from "./types";

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "uuid");

export const reportSubscriptionInputSchema = z
  .object({
    name: z.string().trim().min(1, "nameRequired").max(100),
    recipientIds: z.array(uuid).min(1, "noRecipients").max(MAX_REPORT_RECIPIENTS),
    frequency: z.enum(REPORT_FREQUENCIES),
    time: z.string().refine((v) => parseTime(v) != null, "invalidTime"),
    weekday: z.number().int().min(1).max(7).nullish(),
    dayOfMonth: z.number().int().min(1).max(28).nullish(),
    sections: z.array(z.enum(REPORT_SECTIONS)).min(1, "noSections"),
    active: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    if (new Set(v.recipientIds.map((r) => r.toLowerCase())).size !== v.recipientIds.length) {
      ctx.addIssue({ code: "custom", path: ["recipientIds"], message: "duplicateRecipients" });
    }
    if (v.frequency === "WEEKLY" && v.weekday == null) ctx.addIssue({ code: "custom", path: ["weekday"], message: "weekdayRequired" });
    if (v.frequency === "MONTHLY" && v.dayOfMonth == null) ctx.addIssue({ code: "custom", path: ["dayOfMonth"], message: "dayRequired" });
  })
  .transform((v) => ({
    ...v,
    recipientIds: v.recipientIds.map((r) => r.toLowerCase()),
    // Sıra e-postadaki sıradır; tekrarlar düşer.
    sections: REPORT_SECTIONS.filter((s) => v.sections.includes(s)) as ReportSection[],
    // Kullanılmayan alan boşaltılır (SQL: weekday / day CHECK'i sıklığa bağlı).
    weekday: v.frequency === "WEEKLY" ? (v.weekday ?? null) : null,
    dayOfMonth: v.frequency === "MONTHLY" ? (v.dayOfMonth ?? null) : null,
  }));

export type ReportSubscriptionInput = z.output<typeof reportSubscriptionInputSchema>;

/** GET /api/reports/preview?sections=a,b&frequency=WEEKLY */
export const reportPreviewQuerySchema = z.object({
  sections: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : [...REPORT_SECTIONS]))
    .pipe(z.array(z.enum(REPORT_SECTIONS)).min(1).max(REPORT_SECTIONS.length)),
  frequency: z.enum(REPORT_FREQUENCIES).default("DAILY"),
});
