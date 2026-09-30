/**
 * Müşteri analizleri alan tipleri — API yanıtları ve ekranlar bu şekilleri paylaşır.
 *
 * DeepSport'ta müşteri = antrenör hesabı; burada müşteri = KURUM (Edoras `institutions`). Kullanım sinyali
 * "antrenör girişi / testi" yerine kurumun öğretmen etkinlikleridir (yoklama, ödev, deneme, konu işleme,
 * duyuru, elle SMS). Öğrenci kişisel verisi CRM'e gelmez; yalnız sayılar.
 */
import type { CrmStatus, InstitutionProgram } from "@/lib/domain/institutions/types";
import type { InstitutionState } from "@/lib/domain/institutions/status";

/** Etkinlik kaynakları (Edoras tabloları; ayrıntı ve uyarılar lib/server/edoras-usage.ts başında). */
export const ACTIVITY_SOURCES = ["attendance", "lessonTopics", "assignments", "exams", "announcements", "sms"] as const;
export type ActivitySource = (typeof ACTIVITY_SOURCES)[number];

export type SourceCounts = Record<ActivitySource, number>;
/** YYYY-MM-DD (Europe/Istanbul günü); kaynakta hiç kayıt yoksa null. */
export type SourceDates = Record<ActivitySource, string | null>;

export interface UsageSignals {
  /** Sayıların (counts) penceresi, gün. */
  windowDays: number;
  students: number;
  teachers: number;
  classes: number;
  /** Aktif dönemde bir sınıfa kayıtlı öğrenci (term_student_classes); aktif dönem yoksa null. */
  enrolledStudents: number | null;
  /** Pencerede yoklama alan farklı öğretmen; kayıt sayfa sınırını aşarsa alt sınır (activeTeachersLowerBound). */
  activeTeachers: number | null;
  activeTeachersLowerBound: boolean;
  /** Penceredeki kayıt sayıları (kaynak başına). */
  counts: SourceCounts;
  /** Kaynak başına en son etkinlik günü (pencereden bağımsız). */
  lastDates: SourceDates;
  /** Kaynakların en yenisi; hiç etkinlik yoksa null. */
  lastActivityOn: string | null;
  /** Okunamayan kaynaklar (izin/zaman aşımı); bunlar için sayı 0'dır ve "yok" değil "bilinmiyor" demektir. */
  unavailable: ActivitySource[];
}

export interface GrowthLicense {
  startsOn: string;
  endsOn: string;
  /** ADMIN dışında null. */
  price: number | null;
  /** Bedelsiz (0 ₺) lisans — tutar değil, yalnız "bedelsiz mi" bilgisi (CRM_AGENT de görür). */
  free: boolean;
}

export interface GrowthPayment {
  amount: number;
  paidOn: string;
}

export interface GrowthCustomer {
  id: string;
  name: string;
  program: InstitutionProgram | null;
  isActive: boolean;
  createdAt: string | null;
  /** CRM kaydı yoksa null ("Kayıtsız"). */
  status: CrmStatus | null;
  state: InstitutionState;
  demoEndsAt: string | null;
  licenseEndsOn: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  licenses: GrowthLicense[];
  /** ADMIN dışında null (tutar). */
  payments: GrowthPayment[] | null;
  usage: UsageSignals | null;
}

export interface GrowthCustomersResponse {
  windowDays: number;
  /** Sunucunun hesapladığı an (ISO). */
  generatedAt: string;
  customers: GrowthCustomer[];
}

/** Haftalık etkinlik: kurum → hafta başına toplam etkinlik (weeks ile aynı sıra). */
export interface WeeklyActivityResponse {
  /** Eskiden yeniye hafta başları (Pazartesi, YYYY-MM-DD). */
  weeks: string[];
  byInstitution: Record<string, number[]>;
  /** Bazı kurum/kaynaklarda satır sınırına takıldı: eski haftalar eksik olabilir. */
  truncated: boolean;
  generatedAt: string;
}
