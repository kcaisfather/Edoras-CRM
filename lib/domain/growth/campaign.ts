/**
 * Sadık müşteri kampanyası (DeepSport Madde 15): segment, şablon ve kanal — kurum düzeyi.
 * Yalnız WhatsApp bağlantı listesi (tek tek, kullanıcı tıklar) ve CSV; hiçbir şey otomatik gönderilmez.
 * E-posta kanalı taşınmadı: DeepSport'ta backend kuyruğu (POST /campaigns) gerektiriyordu; CRM'de toplu pazarlama
 * e-postası için onay/çıkış (opt-out) kaydı ve gönderim geçmişi yok. Saf; testler campaign.test.ts.
 */
import { renewalDaysLeft } from "./renewals";
import { daysSinceActivity, USING_DAYS } from "./usage";
import type { GrowthCustomer } from "./types";

export const CAMPAIGN_SEGMENTS = ["all", "atRisk", "active", "renewSoon"] as const;
export type CampaignSegment = (typeof CAMPAIGN_SEGMENTS)[number];

/** DeepSport "extraQuota" (ek kontenjan) şablonu Edoras'ta karşılıksız (koltuk yok) → "checkIn" (kullanım destek) ile değişti. */
export const CAMPAIGN_TEMPLATES = ["earlyRenewal", "checkIn", "thanks"] as const;
export type CampaignTemplate = (typeof CAMPAIGN_TEMPLATES)[number];

export const CAMPAIGN_CHANNELS = ["whatsapp", "csv"] as const;
export type CampaignChannel = (typeof CAMPAIGN_CHANNELS)[number];

export interface CampaignCandidate {
  id: string;
  name: string;
  contactName: string;
  phone: string | null;
  email: string | null;
  /** Son etkinlikten bu yana gün; hiç yoksa null. */
  daysSinceActivity: number | null;
  /** Lisans bitişine kalan gün; yoksa null. */
  daysLeft: number | null;
}

export function toCandidate(c: GrowthCustomer, now = new Date()): CampaignCandidate {
  return {
    id: c.id,
    name: c.name,
    contactName: c.contactName ?? "",
    phone: c.contactPhone,
    email: c.contactEmail,
    daysSinceActivity: daysSinceActivity(c.usage, now),
    daysLeft: renewalDaysLeft(c, now),
  };
}

/** atRisk: etkinliği son 7 günden eski ama hâlâ "kullanıyor" eşiğinde (yavaşlayan); active: son 14 günde etkin; renewSoon: lisansı ≤ 60 gün içinde biter. */
export function inSegment(c: CampaignCandidate, segment: CampaignSegment): boolean {
  switch (segment) {
    case "all":
      return true;
    case "atRisk":
      return c.daysSinceActivity != null && c.daysSinceActivity > 7;
    case "active":
      return c.daysSinceActivity != null && c.daysSinceActivity <= USING_DAYS;
    case "renewSoon":
      return c.daysLeft != null && c.daysLeft > 0 && c.daysLeft <= 60;
  }
}

/** "{name}" (yetkili adı, yoksa kurum) ve "{organization}" (kurum adı) yer tutucularını doldurur. */
export function renderTemplate(text: string, c: Pick<CampaignCandidate, "name" | "contactName">): string {
  const person = c.contactName.trim() || c.name.trim();
  return text
    .replace(/\{name\}/g, person)
    .replace(/\{organization\}/g, c.name.trim() || person)
    .replace(/[ \t]+([,.!?])/g, "$1")
    .replace(/ {2,}/g, " ")
    .trim();
}
