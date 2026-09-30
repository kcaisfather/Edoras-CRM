import { describe, expect, it } from "vitest";
import type { InstitutionListItem } from "@/lib/domain/institutions/types";
import type { CrmTaskDto } from "@/lib/domain/tasks/types";
import { buildReportSections, sectionsFor, type ReportSourceData } from "./build";
import { REPORT_SECTIONS } from "./types";

// 2026-09-26 Cumartesi 10:00 İstanbul
const NOW = new Date(Date.UTC(2026, 8, 26, 7, 0));
const DAY = 24 * 60 * 60 * 1000;
const iso = (days: number) => new Date(NOW.getTime() + days * DAY).toISOString();
const day = (days: number) => iso(days).slice(0, 10);

const ADMIN = { id: "admin-1", isAdmin: true };
const AGENT = { id: "agent-1", isAdmin: false };

function inst(p: Partial<InstitutionListItem> & { id: string }): InstitutionListItem {
  return { name: p.id, program: "yks", isActive: true, missingInEdoras: false, isInternal: false, createdAt: iso(-100), crm: null, licenseEndsOn: null, ...p };
}
const crm = (status: "DEMO" | "UCRETLI", demoEndsAt: string | null = null) => ({
  status,
  contactName: "",
  contactPhone: "",
  contactEmail: "",
  demoStartedAt: null,
  demoEndsAt,
  convertedAt: null,
  billingComplete: true,
  billingProfileComplete: true,
});

function task(p: Partial<CrmTaskDto> & { id: string }): CrmTaskDto {
  return {
    taskId: null,
    key: p.id,
    kind: "scheduled",
    leadId: null,
    institutionId: null,
    dueDate: day(0),
    refDate: null,
    status: "OPEN",
    assigneeId: null,
    assigneeName: null,
    type: null,
    note: null,
    outcome: null,
    resultNote: null,
    completedAt: null,
    completedBy: null,
    completedByName: null,
    createdBy: null,
    createdByName: null,
    prospect: null,
    ...p,
  };
}

const lead = (p: Partial<ReportSourceData["leads"][number]> & { id: string }): ReportSourceData["leads"][number] => ({
  status: "ARANACAK",
  organizationName: null,
  contactFirstName: null,
  contactLastName: null,
  contactEmail: null,
  contactPhone: null,
  offerAmount: null,
  saleAmount: null,
  institutionId: null,
  ...p,
});

const source: ReportSourceData = {
  tasks: [
    task({ id: "t1", leadId: "l1", dueDate: day(-2), kind: "offer" }),
    task({ id: "t2", institutionId: "demo-ending", dueDate: day(0), kind: "demoEnding" }),
    task({ id: "t3", leadId: "l1", dueDate: day(1) }), // yarın: girmez
    task({ id: "t4", leadId: "l2", dueDate: day(0), kind: "assigned", assigneeId: "agent-1" }),
    task({ id: "t5", leadId: "l2", dueDate: day(0), kind: "assigned", assigneeId: "other" }), // başkasına atanmış
    task({ id: "t6", leadId: "l2", dueDate: day(-1), status: "DONE" }),
    task({ id: "t7", leadId: "l2", dueDate: day(0), kind: "coldList" }),
  ],
  leads: [
    lead({ id: "l1", status: "TEKLIF_VERILDI", organizationName: "Kolej A", offerAmount: 12000 }),
    lead({ id: "l2", status: "TAKIPTE", contactFirstName: "Ali", contactLastName: "Veli", offerAmount: 3000 }),
    lead({ id: "l3", status: "SATIS_OLDU", organizationName: "Kolej C", saleAmount: 9000 }),
    lead({ id: "l4", status: "OLUMSUZ" }),
  ],
  institutions: [
    inst({ id: "demo-ending", name: "Demo Bitiyor", crm: crm("DEMO", day(1)) }),
    inst({ id: "demo-old", name: "Demo Eski", crm: crm("DEMO", day(-20)) }),
    inst({ id: "demo-long-past", name: "Demo Çok Eski", crm: crm("DEMO", day(-60)) }),
    inst({ id: "demo-far", name: "Demo Uzak", crm: crm("DEMO", day(30)) }),
    inst({ id: "paid-30", name: "Ücretli 30", crm: crm("UCRETLI"), licenseEndsOn: day(30) }),
    inst({ id: "paid-90", name: "Ücretli 90", crm: crm("UCRETLI"), licenseEndsOn: day(90) }),
    inst({ id: "paid-expired", name: "Ücretli Bitti", crm: crm("UCRETLI"), licenseEndsOn: day(-3) }),
    inst({ id: "new", name: "Yeni Kurum", createdAt: iso(-1) }),
    inst({ id: "new-internal", name: "İç Kurum", createdAt: iso(-1), isInternal: true }),
    inst({ id: "new-old", name: "Eski Kayıt", createdAt: iso(-10) }),
    inst({ id: "new-with-crm", name: "CRM'li Yeni", createdAt: iso(-1), crm: crm("DEMO", day(200)) }),
    inst({ id: "gone", name: "Silinmiş", missingInEdoras: true, createdAt: null }),
  ],
  payments: [
    { institutionId: "paid-30", amount: 5000, paidOn: day(-2) },
    { institutionId: "paid-90", amount: 8000, paidOn: day(0) },
    { institutionId: "paid-30", amount: 7000, paidOn: day(-40) },
  ],
};

const build = (sections: readonly (typeof REPORT_SECTIONS)[number][], viewer = ADMIN, periodDays = 7) =>
  buildReportSections(source, sections, viewer, { periodDays, now: NOW });
const by = (r: ReturnType<typeof build>) => Object.fromEntries(r.map((s) => [s.section, s]));

describe("buildReportSections (ADMIN)", () => {
  const result = build(REPORT_SECTIONS);
  const s = by(result);

  it("bölümleri istenen sırada, e-posta sırasıyla üretir", () => {
    expect(result.map((x) => x.section)).toEqual([...REPORT_SECTIONS]);
  });

  it("todayTasks: gecikmiş + bugünkü açık görevler; ADMIN atanmış olanı da görür, soğuk liste ve tamamlananlar yok", () => {
    expect(s.todayTasks.lines.map((l) => l.key)).toEqual(["t1", "t2", "t4", "t5"]);
    expect(s.todayTasks.lines[0].detail).toBe("Teklif takibi · 2 gün gecikti");
    expect(s.todayTasks.lines[0].name).toBe("Kolej A");
    expect(s.todayTasks.lines[1].name).toBe("Demo Bitiyor");
    expect(s.todayTasks.lines[1].detail).toBe("Demo bitiyor");
  });

  it("endingDemos: 7 günlük dönemde yalnız 3 gün içinde bitecek demo", () => {
    expect(s.endingDemos.lines.map((l) => l.key)).toEqual(["demo-ending"]);
    expect(s.endingDemos.lines[0].detail).toBe("1 gün kaldı");
  });

  it("expiring60: yalnız ücretli ve 0–60 gün içinde biten", () => {
    expect(s.expiring60.lines.map((l) => l.key)).toEqual(["paid-30"]);
    expect(s.expiring60.lines[0].detail).toBe("30 gün kaldı");
  });

  it("openOffers: tutara göre azalan, toplam ADMIN'e", () => {
    expect(s.openOffers.count).toBe(2);
    expect(s.openOffers.total).toBe(15000);
    expect(s.openOffers.lines.map((l) => [l.name, l.amount])).toEqual([
      ["Kolej A", 12000],
      ["Ali Veli", 3000],
    ]);
  });

  it("newSignups: dönemde açılmış, CRM kaydı olmayan, iç / silinmiş olmayan kurumlar", () => {
    expect(s.newSignups.lines.map((l) => l.key)).toEqual(["new"]);
  });

  it("salesTotal: dönem içindeki tahsilatlar", () => {
    expect(s.salesTotal.count).toBe(2);
    expect(s.salesTotal.total).toBe(13000);
    expect(s.salesTotal.lines.map((l) => [l.name, l.amount])).toEqual([
      ["Ücretli 90", 8000],
      ["Ücretli 30", 5000],
    ]);
  });
});

describe("dönem genişleyince", () => {
  it("aylık dönem eski demoyu ve eski kaydı da içerir; tahsilat penceresi genişler", () => {
    const s = by(build(["endingDemos", "newSignups", "salesTotal"], ADMIN, 30));
    expect(s.endingDemos.lines.map((l) => [l.key, l.detail])).toEqual([["demo-old", "20 gün önce"], ["demo-ending", "1 gün kaldı"]]);
    expect(s.newSignups.lines.map((l) => l.key)).toEqual(["new", "new-old"]);
    expect(s.salesTotal.count).toBe(2);
    const yearly = by(build(["salesTotal"], ADMIN, 60));
    expect(yearly.salesTotal.count).toBe(3);
  });
  it("günlük dönem: dün ve bugünkü tahsilat, önceki günler yok", () => {
    const s = by(build(["salesTotal", "newSignups"], ADMIN, 1));
    expect(s.salesTotal.count).toBe(1);
    expect(s.newSignups.count).toBe(1);
  });
});

describe("CRM_AGENT alıcı: tutar hiçbir yerde yok", () => {
  const result = build(REPORT_SECTIONS, AGENT);
  const s = by(result);

  it("salesTotal bölümü hiç üretilmez", () => {
    expect(result.map((x) => x.section)).toEqual(["todayTasks", "endingDemos", "expiring60", "openOffers", "newSignups"]);
    expect(s.salesTotal).toBeUndefined();
  });

  it("openOffers adet ve ad verir, tutar ve toplam vermez", () => {
    expect(s.openOffers.count).toBe(2);
    expect(s.openOffers.total).toBeNull();
    expect(s.openOffers.lines.every((l) => l.amount === null)).toBe(true);
  });

  it("görevlerde yalnız kendine atanan görünür (başkasınınki değil)", () => {
    expect(s.todayTasks.lines.map((l) => l.key)).toEqual(["t1", "t2", "t4"]);
  });

  it("çıktının hiçbir yerinde tutar sayısı geçmez", () => {
    const text = JSON.stringify(result);
    for (const amount of ["12000", "3000", "15000", "8000", "5000", "13000", "9000"]) expect(text).not.toContain(amount);
  });
});

describe("sectionsFor", () => {
  it("ADMIN hepsini görür; CRM_AGENT salesTotal'ı görmez; sıra sabit", () => {
    expect(sectionsFor(["salesTotal", "todayTasks"], ADMIN)).toEqual(["todayTasks", "salesTotal"]);
    expect(sectionsFor(["salesTotal", "todayTasks"], AGENT)).toEqual(["todayTasks"]);
  });
});

describe("satır sınırı", () => {
  it("11+ kayıtta ilk 10 satır ve 'daha' sayısı", () => {
    const many: ReportSourceData = {
      ...source,
      institutions: Array.from({ length: 13 }, (_, i) => inst({ id: `n${i}`, createdAt: iso(-1) })),
    };
    const [r] = buildReportSections(many, ["newSignups"], ADMIN, { periodDays: 7, now: NOW });
    expect(r.count).toBe(13);
    expect(r.lines).toHaveLength(10);
    expect(r.more).toBe(3);
  });
});
