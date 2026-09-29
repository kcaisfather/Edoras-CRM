import { describe, expect, it } from "vitest";
import type { CrmLead } from "@/lib/domain/crm/types";
import type { InstitutionListItem } from "@/lib/domain/institutions/types";
import {
  bucketTasks,
  countDueOpenTasks,
  deriveTasks,
  filterTasks,
  mergeTasks,
  parseTaskKey,
  taskKey,
  type DeriveInput,
  type DerivedTask,
  type StoredTask,
  type TaskInstitutionInput,
  type TaskLeadInput,
} from "./derive";
import { DEFAULT_RULES, normalizeRules } from "./rules";
import type { CrmTaskDto } from "./types";
import { attachTaskSubjects, taskMatches } from "./view";

const TODAY = "2026-09-26";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const L1 = uuid(1);
const L2 = uuid(2);
const I1 = uuid(101);
const I2 = uuid(102);

const lead = (over: Partial<TaskLeadInput> = {}): TaskLeadInput => ({
  id: L1,
  status: "RANDEVU_PLANLANDI",
  nextFollowUpAt: null,
  offerSentAt: null,
  updatedOn: TODAY,
  institutionId: null,
  saleAmount: null,
  ...over,
});
const inst = (over: Partial<TaskInstitutionInput> = {}): TaskInstitutionInput => ({
  institutionId: I1,
  status: "DEMO",
  demoEndsAt: null,
  licenseEndsOn: null,
  ...over,
});
const input = (over: Partial<DeriveInput> = {}): DeriveInput => ({
  leads: [],
  institutions: [],
  collections: new Map(),
  internal: new Set(),
  openAssignedLeadIds: new Set(),
  ...over,
});
const derive = (over: Partial<DeriveInput>, rules = DEFAULT_RULES, today = TODAY) => deriveTasks(input(over), rules, today);
const withRule = (id: string, patch: Record<string, unknown>) =>
  normalizeRules(DEFAULT_RULES.map((r) => (r.id === id ? { ...r, ...patch } : r)));
const kinds = (tasks: DerivedTask[]) => tasks.map((t) => t.kind);

describe("görev anahtarı", () => {
  it("tür + özne + vade; parçalarına ayrılır", () => {
    const key = taskKey("offer", L1, "2026-09-25");
    expect(key).toBe(`offer:${L1}:2026-09-25`);
    expect(parseTaskKey(key)).toEqual({ kind: "offer", subjectId: L1, dueDate: "2026-09-25" });
    expect(parseTaskKey(`quotaHigh:${L1}:2026-09-25`)).toBeNull();
    expect(parseTaskKey(`assigned:${L1}:2026-09-25`)).toBeNull();
    expect(parseTaskKey(`offer:abc:2026-09-25`)).toBeNull();
    expect(parseTaskKey(`offer:${L1}:25.09.2026`)).toBeNull();
  });
});

describe("deriveTasks — aday kuralları", () => {
  it("teklif +3 gün; açık arama tarihi varsa yerine planlanan arama", () => {
    const offer = derive({ leads: [lead({ status: "TEKLIF_VERILDI", offerSentAt: "2026-09-22" })] });
    expect(offer).toEqual([
      { key: `offer:${L1}:2026-09-25`, kind: "offer", leadId: L1, institutionId: null, dueDate: "2026-09-25", refDate: "2026-09-22" },
    ]);
    const scheduled = derive({ leads: [lead({ status: "TEKLIF_VERILDI", offerSentAt: "2026-09-22", nextFollowUpAt: "2026-09-30" })] });
    expect(kinds(scheduled)).toEqual(["scheduled"]);
    // Teklif tarihi yoksa son güncelleme.
    expect(derive({ leads: [lead({ status: "TEKLIF_VERILDI", updatedOn: "2026-09-20" })] })[0].dueDate).toBe("2026-09-23");
  });

  it("satış olmuş müşteride eski takip tarihi görev üretmez", () => {
    expect(derive({ leads: [lead({ status: "SATIS_OLDU", nextFollowUpAt: "2026-09-26" })] })).toEqual([]);
    expect(kinds(derive({ leads: [lead({ status: "RANDEVU_PLANLANDI", nextFollowUpAt: "2026-09-26" })] }))).toEqual(["scheduled"]);
  });

  it("satış olmadı → 90 gün sonra yeniden temas; kovalar gecikmiş / bugün / yaklaşan", () => {
    const leads = [
      lead({ id: uuid(11), status: "OLUMSUZ", updatedOn: "2026-06-23" }), // vade 09-21 → gecikmiş
      lead({ id: uuid(12), status: "OLUMSUZ", updatedOn: "2026-06-28" }), // vade 09-26 → bugün
      lead({ id: uuid(13), status: "OLUMSUZ", updatedOn: "2026-07-08" }), // vade 10-06 → yaklaşan
      lead({ id: uuid(14), status: "OLUMSUZ", updatedOn: "2026-09-16" }), // vade 12-15 → pencere dışı
    ];
    const tasks = derive({ leads }).map((t) => ({ ...t, dueInDays: Math.round((Date.parse(t.dueDate) - Date.parse(TODAY)) / 86_400_000) }));
    expect(tasks.every((t) => t.kind === "lostRecontact")).toBe(true);
    const b = bucketTasks(tasks);
    expect([b.overdue.length, b.today.length, b.upcoming.length]).toEqual([1, 1, 1]);
  });

  it("tarihsiz Aranacak / Takipte: son güncellemeden N gün sonra", () => {
    const tasks = derive({
      leads: [lead({ id: L1, status: "ARANACAK", updatedOn: "2026-09-23" }), lead({ id: L2, status: "TAKIPTE", updatedOn: "2026-09-25" })],
    });
    expect(tasks.map((t) => [t.kind, t.leadId, t.dueDate])).toEqual([
      ["undatedFollowUp", L1, "2026-09-23"],
      ["undatedFollowUp", L2, "2026-09-25"],
    ]);
  });

  it("tarihsiz takip: planlı tarih, açık elle atanmış görev, başka statü ya da kapalı kural varsa yok", () => {
    const planned = lead({ id: uuid(21), status: "ARANACAK", nextFollowUpAt: "2026-09-30" });
    const assignedLead = lead({ id: uuid(22), status: "TAKIPTE" });
    const demo = lead({ id: uuid(23), status: "DEMO_TANIMLANDI" });
    const tasks = derive({ leads: [planned, assignedLead, demo], openAssignedLeadIds: new Set([uuid(22)]) });
    expect(tasks.filter((t) => t.kind === "undatedFollowUp")).toEqual([]);
    expect(derive({ leads: [lead({ status: "ARANACAK" })] }, withRule("undatedFollowUp", { enabled: false }))).toEqual([]);
  });

  it("açık bakiye: tahsilat bağlı kurumun ödemelerinden; vade son güncelleme ya da son tahsilattan", () => {
    const owing = lead({ status: "SATIS_OLDU", saleAmount: 1000, institutionId: I1, updatedOn: "2026-09-10" });
    const collections = new Map([[I1, { collected: 400, lastPaidOn: "2026-09-16" }]]);
    expect(derive({ leads: [owing], collections })).toEqual([
      { key: `balance:${L1}:2026-09-23`, kind: "balance", leadId: L1, institutionId: null, dueDate: "2026-09-23", refDate: "2026-09-16" },
    ]);
    // Tahsilat girilince vade ileri kayar → yeni görev.
    const later = new Map([[I1, { collected: 600, lastPaidOn: "2026-09-25" }]]);
    expect(derive({ leads: [owing], collections: later })[0].key).toBe(`balance:${L1}:2026-10-02`);
    // Bakiye kapandı, satış olmadı, bağlı değil (tahsilat 0 → bakiye var).
    expect(derive({ leads: [owing], collections: new Map([[I1, { collected: 1000, lastPaidOn: "2026-09-25" }]]) })).toEqual([]);
    expect(derive({ leads: [{ ...owing, status: "OLUMSUZ", nextFollowUpAt: "2026-12-01" }], collections })).toMatchObject([{ kind: "scheduled" }]);
    expect(kinds(derive({ leads: [{ ...owing, institutionId: null }] }))).toEqual(["balance"]);
  });
});

describe("deriveTasks — kurum kuralları (demo ve lisans 1 yıl)", () => {
  it("demo bitişine 30 gün kala; özne kurum, müşteri bağlı aday", () => {
    const tasks = derive({ institutions: [inst({ demoEndsAt: "2026-10-16" })] });
    expect(tasks).toEqual([
      { key: `demoEnding:${I1}:2026-09-16`, kind: "demoEnding", leadId: null, institutionId: I1, dueDate: "2026-09-16", refDate: "2026-10-16" },
    ]);
    const linked = derive({ institutions: [inst({ demoEndsAt: "2026-10-16" })], leads: [lead({ institutionId: I1 })] });
    expect(linked[0]).toMatchObject({ key: `demoEnding:${I1}:2026-09-16`, leadId: L1, institutionId: I1 });
  });

  it("demo bitti: kısa süre 'Demo bitiyor' da açık kalır, sonra yalnız 'Süresi doldu'", () => {
    // Bitiş dün: ikisi birden.
    expect(kinds(derive({ institutions: [inst({ demoEndsAt: "2026-09-25" })] }))).toEqual(["demoEnding", "expired"]);
    // Bitiş 10 gün önce: yalnız süresi doldu (bitiş + 0 gün).
    expect(derive({ institutions: [inst({ demoEndsAt: "2026-09-16" })] })).toEqual([
      { key: `expired:${I1}:2026-09-16`, kind: "expired", leadId: null, institutionId: I1, dueDate: "2026-09-16", refDate: "2026-09-16" },
    ]);
    // 90 günden eski bitiş görev üretmez.
    expect(derive({ institutions: [inst({ demoEndsAt: "2026-06-01" })] })).toEqual([]);
    // Süresi doldu kuralının günü: bitiş + N.
    expect(derive({ institutions: [inst({ demoEndsAt: "2026-09-16" })] }, withRule("expired", { days: 3 }))[0].dueDate).toBe("2026-09-19");
  });

  it("yıllık lisans bitişine 60 gün kala; bitince 'Süresi doldu', yenilenince yeni bitiş", () => {
    const paid = inst({ status: "UCRETLI", licenseEndsOn: "2026-11-15" });
    expect(derive({ institutions: [paid] })).toEqual([
      { key: `annualRenewal:${I1}:2026-09-16`, kind: "annualRenewal", leadId: null, institutionId: I1, dueDate: "2026-09-16", refDate: "2026-11-15" },
    ]);
    // Bitiş günü lisans bitmiştir ([başlangıç, bitiş)).
    expect(kinds(derive({ institutions: [inst({ status: "UCRETLI", licenseEndsOn: TODAY })] }))).toEqual(["expired"]);
    // Yenileme: en geç bitiş ileri kaydı → yenileme görevi yeni bitişe, süresi doldu yok.
    expect(derive({ institutions: [inst({ status: "UCRETLI", licenseEndsOn: "2027-09-20" })] })).toMatchObject([
      { kind: "annualRenewal", dueDate: "2027-07-22", refDate: "2027-09-20" },
    ]);
    // Ücretliye geçmiş kurumun eski demo tarihi görev üretmez.
    expect(kinds(derive({ institutions: [inst({ status: "UCRETLI", demoEndsAt: "2026-10-01", licenseEndsOn: "2027-09-01" })] }))).toEqual([
      "annualRenewal",
    ]);
  });

  it("iç kurumlar görev üretmez; bağlı adayın görevleri de", () => {
    const internal = new Set([I1]);
    const tasks = derive({
      institutions: [inst({ demoEndsAt: "2026-10-16" }), inst({ institutionId: I2, demoEndsAt: "2026-10-16" })],
      leads: [lead({ institutionId: I1, status: "ARANACAK" }), lead({ id: L2, status: "ARANACAK" })],
      internal,
    });
    expect(tasks.map((t) => [t.kind, t.institutionId ?? t.leadId])).toEqual([
      ["demoEnding", I2],
      ["undatedFollowUp", L2],
    ]);
  });

  it("bağlı aday 'Satış olmadı' ise kurum görevi yerine yeniden temas", () => {
    const tasks = derive({
      institutions: [inst({ demoEndsAt: "2026-09-20" })],
      leads: [lead({ institutionId: I1, status: "OLUMSUZ", updatedOn: "2026-09-20" })],
    });
    expect(kinds(tasks)).toEqual(["lostRecontact"]);
  });

  it("kapalı kurallar ve modülü gelmemiş kurallar görev üretmez", () => {
    const off = normalizeRules(DEFAULT_RULES.map((r) => ({ ...r, enabled: false })));
    const all = {
      leads: [lead({ status: "OLUMSUZ" }), lead({ id: L2, status: "TEKLIF_VERILDI", nextFollowUpAt: "2026-09-27" })],
      institutions: [inst({ demoEndsAt: "2026-10-01" }), inst({ institutionId: I2, status: "UCRETLI", licenseEndsOn: "2026-09-01" })],
    };
    expect(derive(all, off)).toEqual([]);
    const onlyModules = normalizeRules(DEFAULT_RULES.map((r) => ({ ...r, enabled: r.id === "surveyNoResponse" || r.id === "coldList" })));
    expect(derive(all, onlyModules)).toEqual([]);
  });
});

// --- Birleştirme, görünürlük, rozet -------------------------------------------------------------

const ADMIN = { id: uuid(900), isAdmin: true };
const AGENT_A = { id: uuid(901), isAdmin: false };
const AGENT_B = { id: uuid(902), isAdmin: false };

const stored = (over: Partial<StoredTask>): StoredTask => ({
  id: uuid(500),
  kind: "assigned",
  leadId: L1,
  institutionId: null,
  dueDate: TODAY,
  status: "OPEN",
  assigneeId: null,
  type: "arama",
  key: null,
  note: null,
  outcome: null,
  resultNote: null,
  completedAt: null,
  completedBy: null,
  createdBy: ADMIN.id,
  ...over,
});

describe("mergeTasks + filterTasks", () => {
  const names = new Map([
    [ADMIN.id, "Yönetici"],
    [AGENT_A.id, "Ayşe"],
  ]);
  const derived = deriveTasks(
    input({
      leads: [lead({ status: "TEKLIF_VERILDI", offerSentAt: "2026-09-22" }), lead({ id: L2, status: "OLUMSUZ", updatedOn: "2026-06-28" })],
    }),
    DEFAULT_RULES,
    TODAY
  );
  const doneOffer = stored({
    id: uuid(501),
    kind: "offer",
    type: null,
    key: `offer:${L1}:2026-09-25`,
    dueDate: "2026-09-25",
    status: "DONE",
    outcome: "ulasildi",
    completedAt: Date.parse("2026-09-26T08:00:00Z"),
    completedBy: AGENT_A.id,
  });
  const oldDone = stored({
    id: uuid(502),
    kind: "expired",
    type: null,
    leadId: null,
    institutionId: I1,
    key: `expired:${I1}:2026-09-01`,
    dueDate: "2026-09-01",
    status: "DONE",
    completedAt: Date.parse("2026-09-02T08:00:00Z"),
    completedBy: AGENT_B.id,
  });
  const mine = stored({ id: uuid(503), assigneeId: AGENT_A.id, note: "Ara" });
  const pool = stored({ id: uuid(504), dueDate: "2026-09-30" });
  const merged = mergeTasks(derived, [doneOffer, oldDone, mine, pool], { names, leadOfInstitution: new Map([[I1, L2]]) });

  it("tamamlanan kural görevi eşleşir; koşulu kalkmış tamamlanmış görev tarihçede kalır", () => {
    const offer = merged.find((t) => t.kind === "offer");
    expect(offer).toMatchObject({
      id: `offer:${L1}:2026-09-25`,
      taskId: uuid(501),
      status: "DONE",
      outcome: "ulasildi",
      completedByName: "Ayşe",
      refDate: "2026-09-22",
    });
    const lost = merged.find((t) => t.kind === "lostRecontact");
    expect(lost).toMatchObject({ status: "OPEN", taskId: null, key: `lostRecontact:${L2}:2026-09-26` });
    // Kurum görevinin adayı güncel bağlantıdan.
    expect(merged.find((t) => t.kind === "expired")).toMatchObject({ id: `expired:${I1}:2026-09-01`, leadId: L2, institutionId: I1 });
    expect(merged.find((t) => t.id === uuid(503))).toMatchObject({ kind: "assigned", assigneeName: "Ayşe", note: "Ara", createdByName: "Yönetici" });
    expect(merged.map((t) => t.dueDate)).toEqual([...merged.map((t) => t.dueDate)].sort());
  });

  it("görünürlük: kural ve havuz görevi herkese, atanmış görev yalnız atanana ve yöneticiye", () => {
    const view = (viewer: typeof ADMIN) => filterTasks(merged, { viewer, today: TODAY, to: "2026-10-10" }).map((t) => t.id);
    expect(view(ADMIN)).toContain(uuid(503));
    expect(view(AGENT_A)).toContain(uuid(503));
    expect(view(AGENT_B)).not.toContain(uuid(503));
    expect(view(AGENT_B)).toContain(uuid(504));
    expect(view(AGENT_B)).toContain(`offer:${L1}:2026-09-25`);
  });

  it("vade penceresi, durum ve son 90 günde tamamlananlar", () => {
    const f = (over: Partial<Parameters<typeof filterTasks>[1]> = {}) =>
      filterTasks(merged, { viewer: ADMIN, today: TODAY, to: TODAY, ...over }).map((t) => t.id);
    expect(f()).not.toContain(uuid(504)); // 09-30 pencere dışında
    expect(f({ status: "OPEN" })).toEqual([uuid(503), `lostRecontact:${L2}:2026-09-26`]);
    expect(f({ status: "DONE" })).toEqual([`expired:${I1}:2026-09-01`, `offer:${L1}:2026-09-25`]);
    expect(f({ from: "2026-09-20" })).not.toContain(`expired:${I1}:2026-09-01`);
    // 90 günden önce tamamlanan görev listelenmez.
    expect(filterTasks(merged, { viewer: ADMIN, today: "2026-12-10", to: "2026-12-10", status: "DONE" }).map((t) => t.id)).toEqual([
      `offer:${L1}:2026-09-25`,
    ]);
  });

  it("rozet: gecikmiş + bugün açık görevler", () => {
    const visible = filterTasks(merged, { viewer: AGENT_B, today: TODAY, to: TODAY });
    expect(countDueOpenTasks(visible, TODAY)).toBe(1);
    expect(countDueOpenTasks(filterTasks(merged, { viewer: AGENT_A, today: TODAY, to: TODAY }), TODAY)).toBe(2);
    expect(countDueOpenTasks([], TODAY)).toBe(0);
  });
});

describe("bucketTasks", () => {
  const t = (id: string, dueInDays: number) => ({ id, dueInDays });
  const tasks = [t("a", -5), t("b", -1), t("c", 0), t("d", 1), t("e", 14), t("f", 30)];

  it("gecikmiş / bugün / yaklaşan (≤ 14 gün); ötesi listelenmez", () => {
    const b = bucketTasks(tasks);
    expect([b.overdue.map((x) => x.id), b.today.map((x) => x.id), b.upcoming.map((x) => x.id)]).toEqual([["a", "b"], ["c"], ["d", "e"]]);
  });
});

describe("attachTaskSubjects + taskMatches", () => {
  const dto = (over: Partial<CrmTaskDto>): CrmTaskDto => ({
    id: "x",
    taskId: null,
    key: null,
    kind: "scheduled",
    leadId: null,
    institutionId: null,
    dueDate: TODAY,
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
    ...over,
  });
  const institution = { id: I1, name: "Işık Koleji", crm: { contactName: "Ali Veli", contactPhone: "+905321112233" } } as unknown as InstitutionListItem;
  const leads: CrmLead[] = [{ id: L1, organizationName: "Deneme Dershanesi", contactFirstName: "Ayşe", institutionId: I1, institution }];

  it("adayı ya da kurumu bulunan satırlar birleşir, bulunamayan atlanır; vadeye kalan gün hesaplanır", () => {
    const out = attachTaskSubjects(
      [
        dto({ id: "a", leadId: L1, dueDate: "2026-09-24" }),
        dto({ id: "b", kind: "expired", institutionId: I1 }),
        dto({ id: "c", kind: "demoEnding", institutionId: I2 }),
        dto({ id: "d", leadId: L2 }),
      ],
      leads,
      [institution],
      TODAY
    );
    expect(out.map((t) => [t.id, t.lead?.id ?? null, t.institution?.id ?? null, t.dueInDays])).toEqual([
      ["a", L1, I1, -2],
      ["b", null, I1, 0],
    ]);
    expect(taskMatches(out[0], "deneme")).toBe(true);
    expect(taskMatches(out[1], "IŞIK")).toBe(true);
    expect(taskMatches(out[1], "ali veli")).toBe(true);
    expect(taskMatches(out[1], "yok böyle")).toBe(false);
    expect(taskMatches(out[1], "  ")).toBe(true);
  });
});
