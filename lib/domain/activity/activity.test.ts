import { describe, expect, it } from "vitest";
import activity from "@/messages/features/activity.tr.json";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "./audit-actions";
import { auditLogsQuerySchema, sanitizeAuditDetails } from "./audit-logs";
import { INSTITUTION_EVENT_TYPES, MAX_EVENT_ROWS, institutionEventsQuerySchema, istanbulRange, mergeEventPage, resolveEventWindow } from "./events";

describe("etiketler", () => {
  it("her eylem, kayıt türü ve olay türünün Türkçe etiketi var", () => {
    const actions = activity.audit.actions as Record<string, string>;
    const entities = activity.audit.entities as Record<string, string>;
    const types = activity.events.types as Record<string, string>;
    for (const a of AUDIT_ACTIONS) expect(actions[a], a).toBeTruthy();
    for (const e of AUDIT_ENTITY_TYPES) expect(entities[e], e).toBeTruthy();
    for (const t of INSTITUTION_EVENT_TYPES) expect(types[t], t).toBeTruthy();
  });
});

describe("resolveEventWindow", () => {
  it("varsayılan son 7 gün; 90 günü aşan aralık kısaltılır; gelecek bitiş bugüne çekilir", () => {
    expect(resolveEventWindow(null, null, "2026-09-30")).toEqual({ from: "2026-09-24", to: "2026-09-30", clamped: false });
    const r = resolveEventWindow("2026-01-01", "2026-09-30", "2026-09-30");
    expect(r.clamped).toBe(true);
    expect(r.from).toBe("2026-07-03");
    expect(resolveEventWindow("2026-09-01", "2027-01-01", "2026-09-30").to).toBe("2026-09-30");
  });
  it("istanbulRange bitişi ertesi gün 00:00 (hariç)", () => {
    expect(istanbulRange("2026-09-01", "2026-09-30")).toEqual({ start: "2026-09-01T00:00:00+03:00", end: "2026-10-01T00:00:00+03:00" });
  });
});

describe("institutionEventsQuerySchema", () => {
  it("bilinmeyen türler atılır, sayfa gezilebilir sınıra çekilir", () => {
    const q = institutionEventsQuerySchema.parse({ types: "SMS_SENT,X,SMS_SENT", page: "999", size: "100" });
    expect(q.types).toEqual(["SMS_SENT"]);
    expect(q.page).toBe(Math.ceil(MAX_EVENT_ROWS / 100) - 1);
  });
  it("mergeEventPage yeniden eskiye birleştirip keser", () => {
    const a = [{ id: "a1", at: "2026-09-02T10:00:00Z" }, { id: "a2", at: "2026-09-01T10:00:00Z" }];
    const b = [{ id: "b1", at: "2026-09-03T10:00:00Z" }];
    expect(mergeEventPage([a, b], 1, 2).map((e) => e.id)).toEqual(["a1", "a2"]);
  });
});

describe("işlem kaydı", () => {
  it("details yalnız düz değerler, kısaltılmış", () => {
    const d = sanitizeAuditDetails({ a: "x".repeat(300), b: { c: 1 }, d: [1], e: 5, f: null, g: true });
    expect(Object.keys(d)).toEqual(["a", "e", "f", "g"]);
    expect((d.a as string).length).toBe(201);
    expect(sanitizeAuditDetails([1])).toEqual({});
  });
  it("bozuk süzgeç değerleri düşer", () => {
    expect(auditLogsQuerySchema.parse({ action: "X", actorId: "y", from: "bad", page: "-1", size: "9999" })).toEqual({ page: 0, size: 20 });
  });
});
