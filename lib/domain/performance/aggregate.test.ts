import { describe, expect, it } from "vitest";
import { aggregatePerformance, csvCell, inRange, rate, redactMoney, sumMetrics, type PerfInput } from "./aggregate";

const RANGE = { from: "2026-10-01", to: "2026-10-31" };
// İstanbul gününe düşen epoch ms (UTC+3): öğlen 12:00.
const at = (day: string) => Date.parse(`${day}T09:00:00Z`);

const base = (over: Partial<PerfInput> = {}): PerfInput => ({
  range: RANGE,
  today: "2026-10-15",
  staff: [
    { id: "a", name: "Ayşe", active: true },
    { id: "b", name: "Burak", active: true },
    { id: "x", name: "Eski", active: false },
  ],
  leads: [],
  doneTasks: [],
  openTasks: [],
  notes: [],
  payments: [],
  appointments: [],
  ...over,
});
const row = (r: ReturnType<typeof aggregatePerformance>, id: string) => r.rows.find((x) => x.userId === id)!.metrics;

describe("aggregatePerformance", () => {
  it("teklif ve satış, offer_by / sold_by kişisine ve dönem günlerine göre sayılır", () => {
    const r = aggregatePerformance(
      base({
        leads: [
          { ownerId: "a", createdAt: at("2026-09-01"), offerSentAt: "2026-10-03", offerBy: "a", offerAmount: 100, soldAt: "2026-10-10", soldBy: "b", saleAmount: 250 },
          { ownerId: "a", createdAt: at("2026-09-01"), offerSentAt: "2026-09-30", offerBy: "a", offerAmount: 999, soldAt: "2026-11-01", soldBy: "b", saleAmount: 999 },
        ],
      })
    );
    expect(row(r, "a")).toMatchObject({ offersCount: 1, offersAmount: 100, salesCount: 0 });
    expect(row(r, "b")).toMatchObject({ salesCount: 1, salesAmount: 250, offersCount: 0 });
  });

  it("yeni aday sahibine yazılır; İstanbul gün sınırı gözetilir", () => {
    // 2026-09-30 21:30 UTC = 2026-10-01 00:30 İstanbul → dönemde.
    const r = aggregatePerformance(
      base({
        leads: [
          { ownerId: "a", createdAt: Date.parse("2026-09-30T21:30:00Z"), offerSentAt: null, offerBy: null, offerAmount: null, soldAt: null, soldBy: null, saleAmount: null },
          { ownerId: null, createdAt: at("2026-10-05"), offerSentAt: null, offerBy: null, offerAmount: null, soldAt: null, soldBy: null, saleAmount: null },
        ],
      })
    );
    expect(row(r, "a").newLeads).toBe(1);
    expect(r.totals.newLeads).toBe(1);
  });

  it("aramalar: ulaşılamadı ayrı, diğer sonuçlar konuşma sayılır; dönem dışı sayılmaz", () => {
    const r = aggregatePerformance(
      base({
        doneTasks: [
          { completedAt: at("2026-10-02"), completedBy: "a", outcome: "ulasildi" },
          { completedAt: at("2026-10-02"), completedBy: "a", outcome: "ilgilenmiyor" },
          { completedAt: at("2026-10-03"), completedBy: "a", outcome: "ulasilamadi" },
          { completedAt: at("2026-10-04"), completedBy: "a", outcome: null },
          { completedAt: at("2026-11-04"), completedBy: "a", outcome: "ulasildi" },
        ],
      })
    );
    expect(row(r, "a")).toMatchObject({ calls: 4, reached: 2, unreached: 1 });
  });

  it("açık görevler anlıktır: vadesi geçenler gecikmiş sayılır", () => {
    const r = aggregatePerformance(
      base({
        openTasks: [
          { assigneeId: "b", dueDate: "2026-10-14" },
          { assigneeId: "b", dueDate: "2026-10-15" },
          { assigneeId: "b", dueDate: "2026-12-01" },
        ],
      })
    );
    expect(row(r, "b")).toMatchObject({ tasksOpen: 3, tasksOverdue: 1 });
  });

  it("tahsilat ödemeyi girene, not yazana yazılır", () => {
    const r = aggregatePerformance(
      base({
        payments: [
          { createdBy: "a", paidOn: "2026-10-05", amount: 500 },
          { createdBy: "a", paidOn: "2026-10-06", amount: 250 },
          { createdBy: "a", paidOn: "2026-08-06", amount: 1 },
        ],
        notes: [
          { authorId: "b", createdAt: at("2026-10-07") },
          { authorId: "b", createdAt: at("2026-12-07") },
        ],
      })
    );
    expect(row(r, "a")).toMatchObject({ collectionsCount: 2, collectionsAmount: 750 });
    expect(row(r, "b").notes).toBe(1);
  });

  it("randevu: iptal sayılmaz; gerçekleşen ve gelmeyen ayrı sayılır", () => {
    const r = aggregatePerformance(
      base({
        appointments: [
          { assigneeId: "a", startsAt: at("2026-10-05"), status: "HELD" },
          { assigneeId: "a", startsAt: at("2026-10-06"), status: "NO_SHOW" },
          { assigneeId: "a", startsAt: at("2026-10-07"), status: "SCHEDULED" },
          { assigneeId: "a", startsAt: at("2026-10-08"), status: "CANCELLED" },
        ],
      })
    );
    expect(row(r, "a")).toMatchObject({ appointmentsPlanned: 3, appointmentsHeld: 1, appointmentsNoShow: 1 });
  });

  it("pasif personel yalnız dönemde etkinliği varsa görünür; etkinliği olmayan aktif personel görünür", () => {
    const quiet = aggregatePerformance(base());
    expect(quiet.rows.map((r) => r.userId).sort()).toEqual(["a", "b"]);
    const busy = aggregatePerformance(base({ notes: [{ authorId: "x", createdAt: at("2026-10-07") }] }));
    expect(busy.rows.map((r) => r.userId).sort()).toEqual(["a", "b", "x"]);
  });

  it("ekipte olmayan ya da sahipsiz kayıt sayılmaz; toplam satırların toplamıdır", () => {
    const r = aggregatePerformance(base({ notes: [{ authorId: "yok", createdAt: at("2026-10-07") }, { authorId: null, createdAt: at("2026-10-07") }, { authorId: "a", createdAt: at("2026-10-07") }] }));
    expect(r.totals.notes).toBe(1);
    expect(r.totals).toEqual(sumMetrics(r.rows.map((x) => x.metrics)));
  });

  it("sıralama: satış tutarı çoksa önce", () => {
    const r = aggregatePerformance(
      base({
        leads: [
          { ownerId: null, createdAt: 0, offerSentAt: null, offerBy: null, offerAmount: null, soldAt: "2026-10-02", soldBy: "b", saleAmount: 900 },
          { ownerId: null, createdAt: 0, offerSentAt: null, offerBy: null, offerAmount: null, soldAt: "2026-10-02", soldBy: "a", saleAmount: 100 },
        ],
      })
    );
    expect(r.rows.map((x) => x.userId)).toEqual(["b", "a"]);
  });
});

describe("yardımcılar", () => {
  it("redactMoney yalnız tutarları sıfırlar", () => {
    const m = aggregatePerformance(base({ payments: [{ createdBy: "a", paidOn: "2026-10-05", amount: 500 }] })).rows.find((x) => x.userId === "a")!.metrics;
    expect(redactMoney(m)).toMatchObject({ collectionsAmount: 0, collectionsCount: 1 });
  });
  it("inRange uçlar dahil, bozuk tarih dışında", () => {
    expect(inRange("2026-10-01", RANGE)).toBe(true);
    expect(inRange("2026-10-31", RANGE)).toBe(true);
    expect(inRange("2026-11-01", RANGE)).toBe(false);
    expect(inRange("bozuk", RANGE)).toBe(false);
    expect(inRange(null, RANGE)).toBe(false);
  });
  it("rate payda 0'da null", () => {
    expect(rate(1, 4)).toBe(0.25);
    expect(rate(1, 0)).toBeNull();
  });
  it("csvCell formül enjeksiyonunu ve ayırıcıları kaçırır", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('x"y')).toBe('"x""y"');
    expect(csvCell(-5)).toBe("-5");
  });
});
