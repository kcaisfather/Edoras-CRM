import { describe, expect, it } from "vitest";
import { findDuplicateGroups, funnelRank, leadFunnel, normalizeName } from "./insights";
import type { CrmLead } from "./types";

let seq = 0;
const lead = (p: Partial<CrmLead>): CrmLead => ({ id: `l${++seq}`, ...p });

describe("leadFunnel", () => {
  it("ileri aşamadaki aday önceki aşamaları geçmiş sayılır; kuruma bağlı aday en az demo", () => {
    expect(funnelRank(lead({ status: "OLUMSUZ", institutionId: "i1" }))).toBe(1);
    expect(funnelRank(lead({ status: "OLUMSUZ" }))).toBe(0);
    const steps = leadFunnel([
      lead({ status: "ARANACAK" }),
      lead({ status: "DEMO_TANIMLANDI" }),
      lead({ status: "RANDEVU_PLANLANDI" }),
      lead({ status: "SATIS_OLDU" }),
    ]);
    expect(steps.map((s) => s.count)).toEqual([4, 3, 2, 1]);
    expect(steps[0].stepRate).toBeNull();
    expect(steps[1].stepRate).toBe(75);
    expect(steps[3].stepRate).toBe(50);
    expect(steps[3].overallRate).toBe(25);
  });

  it("boş listede oran null", () => {
    const steps = leadFunnel([]);
    expect(steps.every((s) => s.count === 0 && s.stepRate === null && s.overallRate === null)).toBe(true);
  });
});

describe("findDuplicateGroups", () => {
  it("normalizeName Türkçe karakterleri katlar", () => {
    expect(normalizeName("Çağlayan Temel Lisesi")).toBe("caglayantemellisesi");
  });

  it("aynı telefon (farklı yazım) yüksek güvenle gruplanır", () => {
    const groups = findDuplicateGroups([
      lead({ id: "1", contactPhone: "0532 111 22 33" }),
      lead({ id: "2", contactPhone: "+90 532 1112233" }),
      lead({ id: "3", contactPhone: "0533 000 00 00" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].reasons).toEqual(["phone"]);
    expect(groups[0].confidence).toBe("high");
  });

  it("yalnızca kurum adı eşleşmesi orta güven", () => {
    const groups = findDuplicateGroups([lead({ organizationName: "Ankara Fen Dershanesi" }), lead({ organizationName: "ankara fen dershanesi." })]);
    expect(groups[0].confidence).toBe("medium");
    expect(groups[0].reasons).toEqual(["organization"]);
  });

  it("adaya bağlı kurum mükerrer sayılmaz; bağlanmamış kurumla e-posta eşleşmesi sayılır", () => {
    const leads = [lead({ id: "L1", institutionId: "I1", contactEmail: "x@y.com" }), lead({ id: "L2", contactEmail: "z@y.com" })];
    const institutions = [
      { id: "I1", name: "Bağlı Kurum", email: "x@y.com" },
      { id: "I2", name: "Yeni Kurum", email: "Z@y.com " },
    ];
    const groups = findDuplicateGroups(leads, institutions);
    expect(groups).toHaveLength(1);
    expect(groups[0].records.map((r) => (r.kind === "lead" ? r.lead.id : r.institution.id))).toEqual(["L2", "I2"]);
  });

  it("kurum adı ve yetkili adı kurum kaydından da eşleşir", () => {
    const groups = findDuplicateGroups(
      [lead({ id: "L1", organizationName: "Işık Koleji", contactFirstName: "Ayşe", contactLastName: "Yılmaz" })],
      [{ id: "I1", name: "IŞIK KOLEJİ", contactName: "Ayşe Yılmaz" }]
    );
    expect(groups).toHaveLength(1);
    expect(new Set(groups[0].reasons)).toEqual(new Set(["organization", "name"]));
    expect(groups[0].confidence).toBe("medium");
  });

  it("yalnız kurumlardan oluşan grup gösterilmez", () => {
    expect(findDuplicateGroups([], [{ id: "a", name: "Aynı Kurum Adı" }, { id: "b", name: "Aynı Kurum Adı" }])).toEqual([]);
  });

  it("zincirleme eşleşmeler tek grupta birleşir", () => {
    const groups = findDuplicateGroups([
      lead({ contactEmail: "a@a.com" }),
      lead({ contactEmail: "a@a.com", contactPhone: "05321112233" }),
      lead({ contactPhone: "5321112233" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].records).toHaveLength(3);
    expect(new Set(groups[0].reasons)).toEqual(new Set(["email", "phone"]));
  });
});
