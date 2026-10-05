import { describe, expect, it } from "vitest";
import type { InstitutionListItem } from "@/lib/domain/institutions/types";
import {
  STORED_STATUSES,
  buildLeadIndex,
  demoEndDate,
  filterLeadsClient,
  isDemoEndedNoSale,
  leadBalance,
  pipelineByStatus,
  summarizeLeads,
} from "./signals";
import type { CrmLead } from "./types";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 8, 26, 12, 0, 0);
const ago = (days: number) => NOW.getTime() - days * DAY;
const lead = (over: Partial<CrmLead> = {}): CrmLead => ({ id: "l1", ...over });

/** YYYY-MM-DD, NOW'dan `days` gün sonra (geçmiş için negatif). */
const dayFromNow = (days: number) => {
  const d = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function institution(crm: Partial<NonNullable<InstitutionListItem["crm"]>> | null): InstitutionListItem {
  return {
    id: "i1",
    name: "Kurum",
    program: "yks",
    isActive: true,
    missingInEdoras: false,
    isInternal: false,
    createdAt: null,
    licenseEndsOn: null,
    crm: crm
      ? {
          status: "DEMO",
          contactName: "Ayşe Yılmaz",
          contactPhone: "+905321234567",
          contactEmail: "a@b.co",
          demoStartedAt: null,
          demoEndsAt: null,
          convertedAt: null,
          billingComplete: false,
          billingProfileComplete: false,
          ...crm,
        }
      : null,
  };
}

describe("demo sinyalleri (bağlı kurumun demosu)", () => {
  it("demo bitişi yalnız demodaki kurumdan", () => {
    expect(demoEndDate(lead({ institution: institution({ demoEndsAt: "2026-10-01" }) }))).toBe("2026-10-01");
    expect(demoEndDate(lead({ institution: institution({ status: "UCRETLI", demoEndsAt: "2026-10-01" }) }))).toBeNull();
    expect(demoEndDate(lead())).toBeNull();
  });

  it("demosu son 30 günde bitmiş ve satış olmamış", () => {
    const ended = lead({ status: "DEMO_TANIMLANDI", institution: institution({ demoEndsAt: dayFromNow(-5) }) });
    expect(isDemoEndedNoSale(ended, NOW)).toBe(true);
    expect(isDemoEndedNoSale({ ...ended, status: "SATIS_OLDU" }, NOW)).toBe(false);
    expect(isDemoEndedNoSale(lead({ institution: institution({ demoEndsAt: dayFromNow(0) }) }), NOW)).toBe(true);
    expect(isDemoEndedNoSale(lead({ institution: institution({ demoEndsAt: dayFromNow(3) }) }), NOW)).toBe(false);
    expect(isDemoEndedNoSale(lead({ institution: institution({ demoEndsAt: dayFromNow(-31) }) }), NOW)).toBe(false);
  });
});

describe("istemci süzgeci", () => {
  const leads = [
    lead({ id: "a", status: "ARANACAK", createdAt: ago(5), organizationName: "İstanbul Fen Lisesi", contactPhone: "+905321234567" }),
    lead({ id: "b", status: "SATIS_OLDU", createdAt: ago(50), contactEmail: "x@y.com", institution: institution(null) }),
  ];

  it("statü, tarih ve arama (kurum, e-posta, telefon rakamları)", () => {
    expect(filterLeadsClient(leads, { status: "SATIS_OLDU" }, NOW).map((l) => l.id)).toEqual(["b"]);
    expect(filterLeadsClient(leads, { dateFrom: ago(10) }, NOW).map((l) => l.id)).toEqual(["a"]);
    expect(filterLeadsClient(leads, { search: "istanbul" }, NOW).map((l) => l.id)).toEqual(["a"]);
    expect(filterLeadsClient(leads, { search: "x@y" }, NOW).map((l) => l.id)).toEqual(["b"]);
    expect(filterLeadsClient(leads, { search: "0532 123" }, NOW).map((l) => l.id)).toEqual(["a"]);
    expect(filterLeadsClient(leads, { search: "kurum" }, NOW).map((l) => l.id)).toEqual(["b"]);
  });

  it("kaynak süzgeci (Tümü menüsü, ?source=)", () => {
    const rows = [lead({ id: "a", source: "MANUAL" }), lead({ id: "b", source: "IMPORT" }), lead({ id: "c", source: "COLD_LIST" })];
    expect(filterLeadsClient(rows, { source: "IMPORT" }, NOW).map((l) => l.id)).toEqual(["b"]);
    expect(filterLeadsClient(rows, { source: "EDORAS" }, NOW)).toEqual([]);
    expect(filterLeadsClient(rows, {}, NOW)).toHaveLength(3);
    expect(filterLeadsClient(rows, { source: "COLD_LIST", status: "ARANACAK" }, NOW)).toEqual([]);
  });

  it("Bakiyesi olanlar: yalnız satış > tahsilat", () => {
    const rows = [
      lead({ id: "a", saleAmount: 1000, collectedAmount: 400 }),
      lead({ id: "b", saleAmount: 500, collectedAmount: 500 }),
      lead({ id: "c", saleAmount: 300, collectedAmount: 900 }),
      lead({ id: "d" }),
    ];
    expect(leadBalance(rows[0])).toBe(600);
    expect(leadBalance(rows[2])).toBe(0);
    expect(filterLeadsClient(rows, { tab: "balance" }, NOW).map((l) => l.id)).toEqual(["a"]);
  });
});

describe("özet ve aşamalar", () => {
  it("toplar ve aşamaya göre gruplar (Teklif verildi dahil 8 aşama)", () => {
    const leads = [
      lead({ status: "ARANACAK", offerAmount: 100 }),
      lead({ status: "ARANACAK", offerAmount: 50, saleAmount: 40, collectedAmount: 10 }),
      lead({ status: "OLUMSUZ" }),
    ];
    expect(summarizeLeads(leads)).toEqual({ totalOffer: 150, totalSale: 40, totalCollected: 10, count: 3, saleCount: 0 });
    const stages = pipelineByStatus(leads);
    expect(stages.find((s) => s.status === "ARANACAK")).toEqual({ status: "ARANACAK", count: 2, offer: 150 });
    expect(stages).toHaveLength(8);
    expect(STORED_STATUSES).toContain("TEKLIF_VERILDI");
  });
});

describe("kurum ↔ aday eşlemesi", () => {
  it("kurum id'sine göre", () => {
    const index = buildLeadIndex([lead({ id: "a", institutionId: "i1" }), lead({ id: "b" })]);
    expect(index.get("i1")?.id).toBe("a");
    expect(index.size).toBe(1);
  });
});
