import { describe, expect, it } from "vitest";
import { bucketByWeek, weekStart, weekStarts, weeklySummary } from "./weekly";

const NOW = new Date("2026-09-30T09:00:00Z"); // Çarşamba

describe("haftalık seri", () => {
  it("hafta Pazartesi başlar", () => {
    expect(weekStart("2026-09-30")).toBe("2026-09-28"); // Çarşamba → Pazartesi
    expect(weekStart("2026-09-28")).toBe("2026-09-28");
    expect(weekStart("2026-10-04")).toBe("2026-09-28"); // Pazar hâlâ aynı hafta
    expect(weekStart("2026-10-05")).toBe("2026-10-05");
  });

  it("son n hafta eskiden yeniye; sonuncusu içinde bulunulan hafta", () => {
    expect(weekStarts(3, NOW)).toEqual(["2026-09-14", "2026-09-21", "2026-09-28"]);
  });

  it("günleri hafta kovalarına dağıtır, serinin dışındakini atar", () => {
    const weeks = weekStarts(3, NOW);
    expect(bucketByWeek(["2026-09-15", "2026-09-16", "2026-09-29", "2026-08-01", "2026-10-20"], weeks)).toEqual([2, 0, 1]);
  });

  it("özet: aktif, yeni, kayıp, geri dönen, toplam", () => {
    const weeks = ["w1", "w2", "w3", "w4"];
    const rows = weeklySummary(
      {
        a: [3, 2, 0, 0], // hafta 3'te kaybedildi
        b: [0, 1, 1, 1], // 2. haftada yeni
        c: [1, 0, 0, 4], // 4. haftada geri döndü
      },
      weeks
    );
    expect(rows[0]).toMatchObject({ active: 2, newlyActive: 2, lost: 0, returning: 0, total: 4 });
    expect(rows[1]).toMatchObject({ active: 2, newlyActive: 1, lost: 1, returning: 0, total: 3 }); // c kayıp (w1 aktif, w2 değil)
    expect(rows[2]).toMatchObject({ active: 1, newlyActive: 0, lost: 1, returning: 0, total: 1 }); // a kayıp
    expect(rows[3]).toMatchObject({ active: 2, newlyActive: 0, lost: 0, returning: 1, total: 5 });
  });
});
