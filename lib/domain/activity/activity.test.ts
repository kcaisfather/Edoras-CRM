import { describe, expect, it } from "vitest";
import activity from "@/messages/features/activity.tr.json";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "./audit-actions";
import { auditLogsQuerySchema, sanitizeAuditDetails } from "./audit-logs";
import {
  IMPORTANT_EVENT_TYPES,
  IMPORTANT_GROUP,
  INSTITUTION_EVENT_TYPES,
  MAX_EVENT_ROWS,
  actionToEventType,
  buildEventDetail,
  eventTypeToAction,
  institutionEventsQuerySchema,
  istanbulRange,
  mergeEventPage,
  resolveEventWindow,
} from "./events";

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

describe("önemli işlemler (activity_logs)", () => {
  it("eylem ↔ tür eşlemesi; yayın etkinlik türüyle çakışmaz; bilinmeyen eylem düşer", () => {
    expect(actionToEventType("teacher_removed")).toBe("TEACHER_REMOVED");
    expect(actionToEventType("teacher_password_set")).toBe("TEACHER_PASSWORD_SET");
    expect(actionToEventType("exam_results_published")).toBe("EXAM_RESULTS_PUBLISHED_BY");
    expect(actionToEventType("bilinmeyen_eylem")).toBeNull();
    for (const t of IMPORTANT_EVENT_TYPES) expect(actionToEventType(eventTypeToAction(t))).toBe(t);
  });
  it("?type=IMPORTANT tüm önemli türlere açılır", () => {
    const q = institutionEventsQuerySchema.parse({ types: `${IMPORTANT_GROUP},SMS_SENT` });
    expect(q.types).toEqual([...IMPORTANT_EVENT_TYPES, "SMS_SENT"]);
  });
  it("ayrıntı: öğrencide yalnız numara, programda etiket + sayı, ad çözülen addan", () => {
    expect(buildEventDetail("student_deleted", { studentNo: "175", name: "X" }, null)).toEqual({ kind: "studentNo", values: { no: "175" } });
    expect(buildEventDetail("student_deleted", {}, null)).toBeNull();
    expect(buildEventDetail("timetable_activated", { label: "Güz", activatedCount: 12 }, null)).toEqual({
      kind: "timetable",
      values: { label: "Güz", count: 12 },
    });
    expect(buildEventDetail("attendance_overridden", { date: "2026-10-01", lessonHour: 3 }, null)).toEqual({
      kind: "attendance",
      values: { date: "2026-10-01", hour: 3 },
    });
    expect(buildEventDetail("parent_credentials_sent", { bulk: true, changedCount: 40 }, null)).toEqual({ kind: "parents", values: { count: 40 } });
    expect(buildEventDetail("teacher_removed", {}, "Ali Veli")).toEqual({ kind: "name", values: { name: "Ali Veli" } });
    expect(buildEventDetail("class_deleted", { name: "12-A" }, null)).toEqual({ kind: "name", values: { name: "12-A" } });
    expect(buildEventDetail("document_uploaded", { folderId: "f1", name: "dilekce.pdf" }, "X")).toBeNull();
    expect(actionToEventType("document_folder_permissions_changed")).toBe("DOCUMENT_FOLDER_PERMISSIONS_CHANGED");
    expect(buildEventDetail("class_deleted", null, null)).toBeNull();
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
