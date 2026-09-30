/**
 * Rapor bölümleri — CRM verisinden (sunucuda) üretilir; saf fonksiyon, testler build.test.ts. DeepSport'un
 * features/reports/preview.ts'inin karşılığı; EdorasCRM verisine uyarlandı:
 *   todayTasks   Görevlerim'deki gecikmiş + bugünkü açık görevler (görüntüleyicinin göreceği görevler)
 *   endingDemos  demosu dönem içinde bitmiş ya da 3 gün içinde bitecek kurumlar
 *   expiring60   ücretli lisansı 60 gün içinde bitecek kurumlar
 *   openOffers   "Teklif verildi" / "Takipte" adayları (tutar yalnız ADMIN)
 *   newSignups   dönem içinde Edoras'ta açılıp CRM kaydı olmayan kurumlar
 *   salesTotal   dönem içindeki tahsilatlar (crm_payments) — yalnız ADMIN
 *
 * Finansal süzme BURADA yapılır: görüntüleyici ADMIN değilse `salesTotal` hiç üretilmez, `openOffers` tutarsız
 * üretilir. Çağıran ayrıca süzmek zorunda değildir; bu yüzden tutar e-postaya ya da önizlemeye sızamaz.
 */
import { getLeadTitle } from "@/lib/domain/crm/utils";
import type { CrmLeadDto } from "@/lib/domain/crm/types";
import { addDays, daysBetween, todayIso } from "@/lib/domain/institutions/rules";
import type { InstitutionListItem } from "@/lib/domain/institutions/types";
import { canSeeTask, type Viewer } from "@/lib/domain/tasks/derive";
import type { CrmTaskDto, CrmTaskKind } from "@/lib/domain/tasks/types";
import { FINANCIAL_REPORT_SECTIONS, REPORT_SECTIONS, type ReportLine, type ReportSection, type ReportSectionData } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Her bölümde e-postaya / önizlemeye giren en fazla satır. */
export const REPORT_MAX_LINES = 10;

/** "Biten / bitecek demolar": bitişine bu kadar gün kalan demolar da girer (DeepSport DEMO_ENDING_WINDOW_DAYS). */
export const DEMO_ENDING_WINDOW_DAYS = 3;

/** "60 gün içinde biten paketler" penceresi. */
export const EXPIRING_WINDOW_DAYS = 60;

export const REPORT_SECTION_TITLES: Record<ReportSection, string> = {
  todayTasks: "Bugünün görevleri",
  endingDemos: "Biten / bitecek demolar",
  expiring60: "60 gün içinde bitecek paketler",
  openOffers: "Takipteki teklifler",
  newSignups: "Yeni kayıtlar (CRM dışı)",
  salesTotal: "Satış toplamı (tahsilat)",
};

export const TASK_KIND_LABELS: Record<CrmTaskKind, string> = {
  scheduled: "Planlı arama",
  offer: "Teklif takibi",
  demoEnding: "Demo bitiyor",
  annualRenewal: "Yıllık yenileme",
  expired: "Süresi doldu",
  balance: "Bakiye takibi",
  lostRecontact: "Yeniden arama",
  undatedFollowUp: "Tarihsiz takip",
  surveyNoResponse: "Anket araması",
  coldList: "Soğuk liste",
  assigned: "Atanan görev",
};

export interface ReportPayment {
  institutionId: string;
  amount: number;
  /** YYYY-MM-DD */
  paidOn: string;
}

export interface ReportSourceData {
  /** Açık görevler (yalnız kural + atanan; soğuk liste görevi yok). Görünürlük burada süzülür. */
  tasks: readonly CrmTaskDto[];
  /** Tutarları DOLU adaylar; süzme `viewer`'a göre burada yapılır. */
  leads: readonly Pick<
    CrmLeadDto,
    "id" | "status" | "organizationName" | "contactFirstName" | "contactLastName" | "contactEmail" | "contactPhone" | "offerAmount" | "saleAmount" | "institutionId"
  >[];
  institutions: readonly InstitutionListItem[];
  payments: readonly ReportPayment[];
}

export interface ReportViewer extends Viewer {
  id: string;
}

const isAdmin = (v: Viewer) => v.isAdmin;

/** Görüntüleyicinin göremeyeceği (finansal) bölümleri düşürür; sıra REPORT_SECTIONS sırasıdır. */
export function sectionsFor(requested: readonly ReportSection[], viewer: Viewer): ReportSection[] {
  return REPORT_SECTIONS.filter((s) => requested.includes(s) && (isAdmin(viewer) || s !== "salesTotal"));
}

function cap(lines: ReportLine[], count: number): { lines: ReportLine[]; more: number } {
  const shown = lines.slice(0, REPORT_MAX_LINES);
  return { lines: shown, more: Math.max(0, count - shown.length) };
}

const dayText = (d: number) => (d < 0 ? `${-d} gün önce` : d === 0 ? "bugün" : `${d} gün kaldı`);

export function buildReportSections(
  source: ReportSourceData,
  requested: readonly ReportSection[],
  viewer: ReportViewer,
  opts: { periodDays: number; now?: Date }
): ReportSectionData[] {
  const now = opts.now ?? new Date();
  const today = todayIso(now);
  const since = now.getTime() - opts.periodDays * DAY_MS;
  const financial = isAdmin(viewer);

  const institutionName = new Map(source.institutions.map((i) => [i.id, i.name]));
  const leadName = new Map(source.leads.map((l) => [l.id, getLeadTitle(l).title]));
  const customers = source.institutions.filter((i) => !i.missingInEdoras && !i.isInternal);

  const out: ReportSectionData[] = [];
  for (const section of sectionsFor(requested, viewer)) {
    const title = REPORT_SECTION_TITLES[section];
    switch (section) {
      case "todayTasks": {
        const rows = source.tasks.filter((t) => t.status === "OPEN" && t.kind !== "coldList" && t.dueDate <= today && canSeeTask(t, viewer));
        const lines = rows.map<ReportLine>((t) => {
          const late = daysBetween(t.dueDate, today);
          const name = (t.leadId && leadName.get(t.leadId)) || (t.institutionId && institutionName.get(t.institutionId)) || "-";
          return {
            key: t.id,
            name,
            detail: [TASK_KIND_LABELS[t.kind], late > 0 ? `${late} gün gecikti` : null].filter(Boolean).join(" · "),
            amount: null,
          };
        });
        out.push({ section, title, count: lines.length, total: null, ...cap(lines, lines.length) });
        break;
      }
      case "endingDemos": {
        const rows = customers
          .filter((i) => i.crm?.status === "DEMO" && i.crm.demoEndsAt)
          .map((i) => ({ i, d: daysBetween(today, i.crm!.demoEndsAt as string) }))
          .filter((x) => x.d >= -opts.periodDays && x.d <= DEMO_ENDING_WINDOW_DAYS)
          .sort((a, b) => a.d - b.d);
        const lines = rows.map<ReportLine>(({ i, d }) => ({ key: i.id, name: i.name, detail: dayText(d), amount: null }));
        out.push({ section, title, count: lines.length, total: null, ...cap(lines, lines.length) });
        break;
      }
      case "expiring60": {
        const rows = customers
          .filter((i) => i.crm?.status === "UCRETLI" && i.licenseEndsOn)
          .map((i) => ({ i, d: daysBetween(today, i.licenseEndsOn as string) }))
          .filter((x) => x.d >= 0 && x.d <= EXPIRING_WINDOW_DAYS)
          .sort((a, b) => a.d - b.d);
        const lines = rows.map<ReportLine>(({ i, d }) => ({ key: i.id, name: i.name, detail: dayText(d), amount: null }));
        out.push({ section, title, count: lines.length, total: null, ...cap(lines, lines.length) });
        break;
      }
      case "openOffers": {
        const rows = source.leads
          .filter((l) => l.status === "TEKLIF_VERILDI" || l.status === "TAKIPTE")
          .sort((a, b) => (b.offerAmount ?? 0) - (a.offerAmount ?? 0) || a.id.localeCompare(b.id));
        const lines = rows.map<ReportLine>((l) => ({
          key: l.id,
          name: getLeadTitle(l).title,
          detail: l.status === "TEKLIF_VERILDI" ? "Teklif verildi" : "Takipte",
          amount: financial ? (l.offerAmount ?? null) : null,
        }));
        out.push({
          section,
          title,
          count: lines.length,
          total: financial ? rows.reduce((s, l) => s + (l.offerAmount ?? 0), 0) : null,
          ...cap(lines, lines.length),
        });
        break;
      }
      case "newSignups": {
        const rows = customers
          .filter((i) => !i.crm && i.createdAt != null && Date.parse(i.createdAt) >= since)
          .sort((a, b) => Date.parse(b.createdAt as string) - Date.parse(a.createdAt as string));
        const lines = rows.map<ReportLine>((i) => ({ key: i.id, name: i.name, detail: i.program ? i.program.toUpperCase() : null, amount: null }));
        out.push({ section, title, count: lines.length, total: null, ...cap(lines, lines.length) });
        break;
      }
      case "salesTotal": {
        // sectionsFor yalnız ADMIN görüntüleyicide bu bölüme izin verir.
        const from = addDays(today, -opts.periodDays);
        const rows = source.payments.filter((p) => p.paidOn >= from && p.paidOn <= today).sort((a, b) => b.amount - a.amount);
        const lines = rows.map<ReportLine>((p, i) => ({
          key: `${p.institutionId}:${p.paidOn}:${i}`,
          name: institutionName.get(p.institutionId) ?? "-",
          detail: null,
          amount: p.amount,
        }));
        out.push({ section, title, count: lines.length, total: rows.reduce((s, p) => s + p.amount, 0), ...cap(lines, lines.length) });
        break;
      }
    }
  }
  return out;
}

/** Finansal olan bölüm mü (arayüzde seçenek rozeti için). */
export const isFinancialSection = (s: ReportSection): boolean => FINANCIAL_REPORT_SECTIONS.includes(s);
