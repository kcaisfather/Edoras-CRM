import { describe, expect, it } from "vitest";
import {
  STAFF_COLUMNS,
  STAFF_WINDOW_ALL,
  buildStaffActivityRows,
  cellValue,
  idleStaffCount,
  parseStaffWindow,
  type StaffActivityRpcRow,
} from "./staff-activity";

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

  it("Toplu ödev paketi (sessions) gösterir; tekil görev sayısı (events) artık sütun değil", () => {
    const [row] = buildStaffActivityRows(
      [rpc("a", "assignment", 5161, 143, 9), rpc("a", "total", 5161, 143, 9)],
      [{ userId: "a", role: "teacher", active: true }],
      []
    );
    expect(row.cells.assignment).toEqual({ events: 5161, sessions: 143, days: 9 });
    expect(cellValue(row, "assignment")).toBe(143);
    expect(cellValue(row, "attendance")).toBe(0);
  });

  it("toplam işlem ödev paketini sayar; ödev kontrolü (review) sütunu kalktığı için yok sayılır", () => {
    const [row] = buildStaffActivityRows(
      [rpc("a", "assignment", 621, 15, 4), rpc("a", "review", 40, 7, 3), rpc("a", "total", 661, 22, 5)],
      [{ userId: "a", role: "teacher", active: true }],
      []
    );
    expect(row.actions).toBe(15); // 15 paket; tekil 621 DEĞİL, kontrol 7 artık sayılmaz
    expect(row.activeDays).toBe(5);
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

  it("onaylanan ödev adet (events) gösterir ve işlem toplamına girmez", () => {
    const [row] = buildStaffActivityRows(
      [rpc("a", "review", 120, 9, 4), rpc("a", "review_approved", 110, 8, 4), rpc("a", "total", 230, 17, 4)],
      [{ userId: "a", role: "teacher", active: true }],
      []
    );
    expect(cellValue(row, "reviewApproved")).toBe(110);
    expect(row.actions).toBe(0);
  });

  it("web oturumu oturum sayısını gösterir, işlem toplamına girmez", () => {
    const [row] = buildStaffActivityRows(
      [rpc("a", "web", 5, 3, 2), rpc("a", "attendance", 4, 4, 2), rpc("a", "total", 9, 7, 3)],
      [{ userId: "a", role: "admin", active: true }],
      []
    );
    expect(cellValue(row, "web")).toBe(3);
    expect(row.actions).toBe(4);
    expect(row.activeDays).toBe(3);
  });

  it("sütun sırası (2026-11-03): Yoklama · Konu işleme · Verilen · Onaylanan · Toplu · Onaya yollanan · Birebir · Deneme · Duyuru · SMS · Mobil · Web · Öğrenci · Ödevli öğrenci · ekran sayaçları", () => {
    expect([...STAFF_COLUMNS]).toEqual([
      "attendance",
      "lessonTopic",
      "assignmentCreated",
      "reviewApproved",
      "assignment",
      "guidanceAwaiting",
      "privateLesson",
      "exam",
      "announcement",
      "sms",
      "mobile",
      "web",
      "students",
      "studentsWithHomework",
      "analysisViews",
      "homeworkViews",
      "examDownloads",
      "homeworkPdfs",
    ]);
  });

  it("öğrenci sütunları sayıdır, işlem toplamına ve aktif güne girmez", () => {
    const [row] = buildStaffActivityRows(
      [rpc("a", "students_total", 40, 40, 0, null), rpc("a", "students_with_homework", 12, 12, 0, null), rpc("a", "total", 3, 3, 2)],
      [{ userId: "a", role: "teacher", active: true }],
      []
    );
    expect(cellValue(row, "students")).toBe(40);
    expect(cellValue(row, "studentsWithHomework")).toBe(12);
    expect(row.actions).toBe(0);
    expect(row.activeDays).toBe(2);
  });

  it("ekran sayaçları her açılışı sayar, işlem toplamına girmez", () => {
    const [row] = buildStaffActivityRows(
      [rpc("a", "screen_analysis", 7, 7, 0, null), rpc("a", "screen_homework_pdf", 2, 2, 0, null)],
      [{ userId: "a", role: "teacher", active: true }],
      []
    );
    expect(cellValue(row, "analysisViews")).toBe(7);
    expect(cellValue(row, "homeworkPdfs")).toBe(2);
    expect(cellValue(row, "examDownloads")).toBe(0);
    expect(row.actions).toBe(0);
  });

  it("rehberler en üstte alt alta: rehber ataması ya da rehberlik branşı", () => {
    const rows = buildStaffActivityRows(
      [rpc("a", "total", 1, 1, 9), rpc("r1", "total", 1, 1, 1)],
      [
        { userId: "a", role: "teacher", active: true },
        { userId: "r1", role: "teacher", active: true },
        { userId: "r2", role: "teacher", active: true },
      ],
      [
        { id: "a", fullName: "Ali", branch: "Matematik" },
        { id: "r1", fullName: "Rana", branch: "Türkçe" },
        { id: "r2", fullName: "Rüya", branch: "Rehberlik" },
      ],
      new Set(["r1"])
    );
    expect(rows.map((r) => [r.userId, r.guidance])).toEqual([
      ["r1", true],
      ["r2", true],
      ["a", false],
    ]);
  });
});

describe("öğretmen kullanımı penceresi", () => {
  it("7/30/90 ve Tümü (0) geçerli; bilinmeyen → 30", () => {
    expect(parseStaffWindow("0")).toBe(STAFF_WINDOW_ALL);
    expect(parseStaffWindow("90")).toBe(90);
    expect(parseStaffWindow("180")).toBe(30);
    expect(parseStaffWindow("abc")).toBe(30);
    expect(parseStaffWindow(null)).toBe(30);
    expect(parseStaffWindow("")).toBe(30);
  });
});

describe("Onaya yollanan (rehber)", () => {
  it("guidance_awaiting satırı kendi sütununu doldurur, işlem toplamına girmez", () => {
    const [row] = buildStaffActivityRows([rpc("t1", "guidance_awaiting", 7, 7, 0, null)], [], []);
    expect(cellValue(row, "guidanceAwaiting")).toBe(7);
    expect(row.actions).toBe(0);
  });
});

describe("Verilen ödev", () => {
  it("verilen ödev = oluşturulan ödev kaydı (events); işlem toplamına girmez", () => {
    const [row] = buildStaffActivityRows([rpc("t1", "assignment", 80, 2, 3), rpc("t1", "assignment_created", 5, 5, 3)], [], []);
    expect(cellValue(row, "assignmentCreated")).toBe(5);
    expect(row.actions).toBe(2);
  });
});
