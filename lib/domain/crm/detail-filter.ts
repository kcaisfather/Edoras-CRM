/**
 * Adaylar "Filtreler" paneli (detaylı süzgeç): URL parametreleri ↔ `ClientLeadFilter` alanları ve açılır liste
 * seçenekleri. Saf fonksiyonlar; süzme kuralının kendisi `signals.ts → filterLeadsClient`.
 */

import { PROGRAM_TAGS, type ProgramTag } from "@/lib/domain/crm-notes/utils";
import { distinctOptions, phoneQueryDigits, sameText, type PresenceFilter } from "@/lib/utils/filter-match";
import { isFollowUpFilter, type ClientLeadFilter, type FollowUpFilter } from "./signals";
import { LOST_REASONS, isLostReason, type CrmLead, type LostReason } from "./types";

/** URL değerleri (kısa parametre adları; "" = süzgeç yok). Alan sırası panelin sırasıdır. */
export interface LeadDetailFilters {
  city: string;
  district: string;
  phone: string;
  email: string;
  org: string;
  contact: string;
  program: ProgramTag | "";
  follow: FollowUpFilter | "";
  lost: LostReason | "";
  hasPhone: PresenceFilter;
  hasEmail: PresenceFilter;
  linked: PresenceFilter;
  complaint: PresenceFilter;
}
export type LeadDetailKey = keyof LeadDetailFilters;

export const LEAD_DETAIL_KEYS: readonly LeadDetailKey[] = [
  "city",
  "district",
  "phone",
  "email",
  "org",
  "contact",
  "program",
  "follow",
  "lost",
  "hasPhone",
  "hasEmail",
  "linked",
  "complaint",
];

function asPresence(value: string): PresenceFilter {
  return value === "yes" || value === "no" ? value : "";
}

/** URL → detay süzgeç değerleri. Tanınmayan seçenek değeri (elle yazılmış URL) "" sayılır. */
export function readLeadDetailFilters(get: (key: string) => string | null): LeadDetailFilters {
  const raw = (key: LeadDetailKey) => get(key) ?? "";
  const program = raw("program");
  const lost = raw("lost");
  const follow = raw("follow");
  return {
    city: raw("city"),
    district: raw("district"),
    phone: raw("phone"),
    email: raw("email"),
    org: raw("org"),
    contact: raw("contact"),
    program: (PROGRAM_TAGS as readonly string[]).includes(program) ? (program as ProgramTag) : "",
    follow: isFollowUpFilter(follow) ? follow : "",
    lost: isLostReason(lost) ? lost : "",
    hasPhone: asPresence(raw("hasPhone")),
    hasEmail: asPresence(raw("hasEmail")),
    linked: asPresence(raw("linked")),
    complaint: asPresence(raw("complaint")),
  };
}

/** Yalnız detay parametrelerinden oluşan kanonik sorgu metni (React bağımlılığı olarak değerle karşılaştırılır). */
export function leadDetailQuery(get: (key: string) => string | null): string {
  const params = new URLSearchParams();
  for (const key of LEAD_DETAIL_KEYS) {
    const value = get(key);
    if (value) params.set(key, value);
  }
  return params.toString();
}

/** Alan gerçekten süzüyor mu (boşluk ya da rakamsız telefon süzmez → etkin sayılmaz, çip çıkmaz). */
export function isDetailActive(key: LeadDetailKey, value: string): boolean {
  if (key === "phone") return phoneQueryDigits(value) !== "";
  return value.trim() !== "";
}

export function detailActiveKeys(d: LeadDetailFilters): LeadDetailKey[] {
  return LEAD_DETAIL_KEYS.filter((key) => isDetailActive(key, d[key]));
}

/** Detay değerlerinin `filterLeadsClient` karşılığı (boş alan gönderilmez). */
export function detailClientFilter(d: LeadDetailFilters): ClientLeadFilter {
  return {
    city: d.city || undefined,
    district: d.district || undefined,
    phone: d.phone || undefined,
    email: d.email || undefined,
    organization: d.org || undefined,
    contact: d.contact || undefined,
    program: d.program || undefined,
    followUp: d.follow || undefined,
    lostReason: d.lost || undefined,
    hasPhone: d.hasPhone || undefined,
    hasEmail: d.hasEmail || undefined,
    linked: d.linked || undefined,
    complaint: d.complaint || undefined,
  };
}

export interface LeadDetailOptions {
  cities: string[];
  /** Seçili ildeki ilçeler (il seçili değilse tüm ilçeler). */
  districts: string[];
  /** Verideki program etiketleri (seçili olan her zaman listede). */
  programs: ProgramTag[];
  /** Verideki kayıp nedenleri, ortak küme sırasıyla (seçili olan her zaman listede). */
  lostReasons: LostReason[];
}

/** Açılır liste seçenekleri: yalnız veride olan değerler (boş sonuç veren seçenek gösterilmez). */
export function leadDetailOptions(leads: CrmLead[], d: Pick<LeadDetailFilters, "city" | "program" | "lost">): LeadDetailOptions {
  const programs = new Set<string>(d.program ? [d.program] : []);
  const lostReasons = new Set<string>(d.lost ? [d.lost] : []);
  for (const lead of leads) {
    for (const tag of lead.programTags ?? []) programs.add(tag);
    if (lead.lostReason) lostReasons.add(lead.lostReason);
  }
  return {
    cities: distinctOptions(leads.map((l) => l.city)),
    districts: distinctOptions(leads.filter((l) => sameText(l.city, d.city)).map((l) => l.district)),
    programs: PROGRAM_TAGS.filter((t) => programs.has(t)),
    lostReasons: LOST_REASONS.filter((r) => lostReasons.has(r)),
  };
}
