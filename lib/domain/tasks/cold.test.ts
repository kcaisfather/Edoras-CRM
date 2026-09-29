import { describe, expect, it } from "vitest";
import { crmContactSets } from "@/lib/domain/cold-lists/utils";
import { deriveColdListTasks, type TaskProspectInput } from "./cold";
import { bucketTasks, parseTaskKey } from "./derive";
import { DEFAULT_RULES, RULES_NEEDING_MODULE, normalizeRules } from "./rules";
import { attachTaskSubjects, taskMatches } from "./view";

const TODAY = "2026-09-26";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
/** Türkiye günü `iso`, öğlen (UTC+3). */
const at = (iso: string) => Date.parse(`${iso}T09:00:00Z`);

const prospect = (n: number, over: Partial<TaskProspectInput> = {}): TaskProspectInput => ({
  id: uuid(n),
  listId: uuid(900),
  listName: "Eylül fuarı",
  outcome: "NOT_CALLED",
  outcomeAt: null,
  crmLeadId: null,
  movedAt: null,
  firstName: "Ali",
  lastName: String(n),
  organization: "",
  phoneRaw: "",
  phone: `+9053200${String(n).padStart(5, "0")}`,
  email: null,
  ...over,
});
const withRule = (patch: Record<string, unknown>) => normalizeRules(DEFAULT_RULES.map((r) => (r.id === "coldList" ? { ...r, ...patch } : r)));
const NO_CRM = crmContactSets([]);

describe("coldList kuralı", () => {
  it("artık bir modül beklemiyor", () => {
    expect(RULES_NEEDING_MODULE.coldList).toBeUndefined();
  });

  it("aranmamış kişi bugün, ulaşılamayan son denemeden N gün sonra; görüşülen / ilgilenmeyen / taşınan / CRM'deki düşer", () => {
    const prospects = [
      prospect(1),
      prospect(3, { outcome: "UNREACHABLE", outcomeAt: at("2026-09-23") }),
      prospect(4, { outcome: "UNREACHABLE", outcomeAt: at("2026-09-25") }),
      prospect(5, { outcome: "TALKED", outcomeAt: at("2026-09-25") }),
      prospect(6, { outcome: "NOT_INTERESTED", outcomeAt: at("2026-09-25") }),
      prospect(7, { crmLeadId: uuid(70), movedAt: at("2026-09-20") }),
      prospect(8, { phone: "+905320000099" }), // CRM'de aynı telefon
    ];
    const crm = crmContactSets([{ phone: "0532 000 00 99" }]);
    const tasks = deriveColdListTasks(prospects, crm, DEFAULT_RULES, TODAY);
    expect(tasks.map((t) => [t.key, t.dueDate, t.refDate, t.prospect?.id])).toEqual([
      [`coldList:${uuid(3)}:2026-09-25`, "2026-09-25", "2026-09-23", uuid(3)],
      [`coldList:${uuid(1)}:${TODAY}`, TODAY, null, uuid(1)],
      [`coldList:${uuid(4)}:2026-09-27`, "2026-09-27", "2026-09-25", uuid(4)],
    ]);
    const t = tasks[1];
    expect(t).toMatchObject({ kind: "coldList", status: "OPEN", taskId: null, leadId: null, institutionId: null, assigneeId: null });
    expect(t.prospect).toMatchObject({ listId: uuid(900), listName: "Eylül fuarı", outcome: "NOT_CALLED", firstName: "Ali" });
    expect(parseTaskKey(t.key ?? "")).toEqual({ kind: "coldList", subjectId: uuid(1), dueDate: TODAY });

    // Görevlerim ekranı: soğuk liste görevi aday / kurum aramadan kalır, kişisiyle aranır.
    const rows = attachTaskSubjects(tasks, [], [], TODAY);
    const b = bucketTasks(rows);
    expect([b.overdue.length, b.today.length, b.upcoming.length]).toEqual([1, 1, 1]);
    expect(taskMatches(rows[1], "eylül")).toBe(true);
    expect(taskMatches(rows[1], "+90532")).toBe(true);
  });

  it("kural kapalıysa ya da gün değişirse", () => {
    const prospects = [prospect(1, { outcome: "UNREACHABLE", outcomeAt: at("2026-09-20") })];
    expect(deriveColdListTasks(prospects, NO_CRM, withRule({ enabled: false }), TODAY)).toEqual([]);
    expect(deriveColdListTasks(prospects, NO_CRM, withRule({ days: 10 }), TODAY)[0].dueDate).toBe("2026-09-30");
  });

  it("sınır: aynı anda en çok N aranmamış kişi (ekleme sırasıyla); ulaşılamayanların tekrar araması sınırlanmaz", () => {
    const fresh = Array.from({ length: 8 }, (_, i) => prospect(10 + i));
    const retries = Array.from({ length: 4 }, (_, i) => prospect(30 + i, { outcome: "UNREACHABLE", outcomeAt: at("2026-09-20") }));
    const tasks = deriveColdListTasks([...retries, ...fresh], NO_CRM, DEFAULT_RULES, TODAY, 3);
    expect(tasks.filter((t) => t.prospect?.outcome === "UNREACHABLE")).toHaveLength(4);
    expect(tasks.filter((t) => t.prospect?.outcome === "NOT_CALLED").map((t) => t.prospect?.id)).toEqual([uuid(10), uuid(11), uuid(12)]);
    // Sırası gelen kişinin sonucu girilince (artık aranmamış değil) sıradaki gelir.
    const next = deriveColdListTasks(
      [...retries, prospect(10, { outcome: "TALKED", outcomeAt: at(TODAY) }), ...fresh.slice(1)],
      NO_CRM,
      DEFAULT_RULES,
      TODAY,
      3
    );
    expect(next.filter((t) => t.prospect?.outcome === "NOT_CALLED").map((t) => t.prospect?.id)).toEqual([uuid(11), uuid(12), uuid(13)]);
  });
});
