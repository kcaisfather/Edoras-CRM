import { describe, expect, it } from "vitest";
import { buildStaffActivityRows, idleStaffCount, type StaffActivityRpcRow } from "./staff-activity";

const rpc = (user_id: string, action: string, event_count: number, session_count: number, active_days: number, last_day: string | null = "2026-10-08"): StaffActivityRpcRow => ({
  user_id,
  action,
  event_count,
  session_count,
  active_days,
  last_day,
});

describe("öğretmen kullanımı satırları", () => {
  it("işlemi olmayan etkin öğretmen 0 ile ve en altta görünür", () => {
    const rows = buildStaffActivityRows(
      [rpc("a", "attendance", 10, 10, 5), rpc("a", "total", 10, 10, 5)],
      [
        { userId: "a", role: "teacher", active: true },
        { userId: "b", role: "teacher", active: true },
      ],
      [
        { id: "a", fullName: "Ayşe Yılmaz", branch: "Matematik" },
        { id: "b", fullName: "Burak Kaya", branch: null },
      ]
    );
    expect(rows.map((r) => r.userId)).toEqual(["a", "b"]);
    expect(rows[1].activeDays).toBe(0);
    expect(rows[1].cells.attendance).toEqual({ events: 0, sessions: 0, days: 0 });
    expect(idleStaffCount(rows)).toBe(1);
  });

  it("aktif gün toplanmaz, kişinin total satırından gelir", () => {
    const [row] = buildStaffActivityRows(
      [rpc("a", "attendance", 20, 20, 8), rpc("a", "assignment", 300, 12, 6), rpc("a", "total", 320, 32, 10)],
      [{ userId: "a", role: "teacher", active: true }],
      []
    );
    expect(row.activeDays).toBe(10); // 8 + 6 = 14 DEĞİL
    expect(row.actions).toBe(32);
    expect(row.cells.assignment).toEqual({ events: 300, sessions: 12, days: 6 });
  });

  it("birleşik sütun: işlem toplanır, gün en büyük parça (alt sınır)", () => {
    const [row] = buildStaffActivityRows(
      [rpc("a", "exam_created", 3, 3, 3), rpc("a", "exam_published", 2, 2, 2), rpc("a", "total", 5, 5, 4)],
      [{ userId: "a", role: "admin", active: true }],
      []
    );
    expect(row.cells.exam).toEqual({ events: 5, sessions: 5, days: 3 });
    expect(row.role).toBe("admin");
  });

  it("mobil oturum 'işlem' sayısına girmez ama aktif güne girer", () => {
    const [row] = buildStaffActivityRows(
      [rpc("a", "mobile", 40, 6, 4), rpc("a", "total", 40, 6, 4)],
      [{ userId: "a", role: "teacher", active: true }],
      []
    );
    expect(row.actions).toBe(0);
    expect(row.activeDays).toBe(4);
    expect(row.cells.mobile.sessions).toBe(6);
  });

  it("pasif ya da listede olmayan kişi yalnız işlemi varsa görünür", () => {
    const rows = buildStaffActivityRows(
      [rpc("x", "sms", 1, 1, 1), rpc("x", "total", 1, 1, 1)],
      [
        { userId: "p", role: "teacher", active: false },
        { userId: "a", role: "teacher", active: true },
      ],
      []
    );
    expect(rows.map((r) => r.userId).sort()).toEqual(["a", "x"]);
    const x = rows.find((r) => r.userId === "x");
    expect(x?.active).toBe(false);
    expect(x?.role).toBe("other");
  });

  it("bilinmeyen işlem türü yok sayılır (sözleşme genişlemesi kırmaz)", () => {
    const [row] = buildStaffActivityRows(
      [rpc("a", "yeni_islem", 9, 9, 9), rpc("a", "total", 9, 9, 2)],
      [{ userId: "a", role: "teacher", active: true }],
      []
    );
    expect(row.actions).toBe(0);
    expect(row.activeDays).toBe(2);
  });

  it("sıra: aktif gün, sonra işlem, sonra ad (Türkçe)", () => {
    const rows = buildStaffActivityRows(
      [rpc("c", "total", 1, 1, 3), rpc("ç", "total", 1, 1, 3)],
      [
        { userId: "c", role: "teacher", active: true },
        { userId: "ç", role: "teacher", active: true },
      ],
      [
        { id: "c", fullName: "Çağrı", branch: null },
        { id: "ç", fullName: "Cem", branch: null },
      ]
    );
    expect(rows.map((r) => r.name)).toEqual(["Cem", "Çağrı"]);
  });
});
