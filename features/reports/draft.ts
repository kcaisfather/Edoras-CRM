/**
 * Rapor formunun durumu (yalnız istemci, kaydedilene kadar bellekte). DeepSport'un localStorage taslağı (draft.ts)
 * BİLEREK yoktur: abonelikler CRM veritabanındadır.
 */
import { parseTime } from "@/lib/domain/reports/schedule";
import {
  DEFAULT_REPORT_TIME,
  REPORT_SECTIONS,
  type ReportFrequency,
  type ReportSection,
  type ReportSubscriptionDto,
} from "@/lib/domain/reports/types";
import type { ReportSubscriptionBody } from "./api";

export interface ReportDraft {
  /** Kayıtlı abonelik; yeni taslakta null. */
  id: string | null;
  name: string;
  recipientIds: string[];
  frequency: ReportFrequency;
  time: string;
  weekday: number;
  dayOfMonth: number;
  sections: ReportSection[];
  active: boolean;
}

export const NEW_REPORT_DRAFT: ReportDraft = {
  id: null,
  name: "",
  recipientIds: [],
  frequency: "DAILY",
  time: DEFAULT_REPORT_TIME,
  weekday: 1,
  dayOfMonth: 1,
  sections: [...REPORT_SECTIONS],
  active: true,
};

export const draftFromSubscription = (s: ReportSubscriptionDto): ReportDraft => ({
  id: s.id,
  name: s.name,
  recipientIds: s.recipientIds,
  frequency: s.frequency,
  time: s.time,
  weekday: s.weekday ?? 1,
  dayOfMonth: s.dayOfMonth ?? 1,
  sections: s.sections,
  active: s.active,
});

/** Sunucuya giden gövde: kullanılmayan gün boşaltılır, bölümler e-posta sırasına dizilir. */
export const draftToBody = (d: ReportDraft): ReportSubscriptionBody => ({
  name: d.name.trim(),
  recipientIds: d.recipientIds,
  frequency: d.frequency,
  time: d.time,
  weekday: d.frequency === "WEEKLY" ? d.weekday : null,
  dayOfMonth: d.frequency === "MONTHLY" ? d.dayOfMonth : null,
  sections: REPORT_SECTIONS.filter((s) => d.sections.includes(s)),
  active: d.active,
});

export type ReportDraftError = "nameRequired" | "noRecipients" | "invalidTime" | "noSections";

export function validateDraft(d: ReportDraft): ReportDraftError[] {
  const errors: ReportDraftError[] = [];
  if (!d.name.trim()) errors.push("nameRequired");
  if (d.recipientIds.length === 0) errors.push("noRecipients");
  if (parseTime(d.time) == null) errors.push("invalidTime");
  if (d.sections.length === 0) errors.push("noSections");
  return errors;
}
