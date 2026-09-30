import { describe, expect, it } from "vitest";
import {
  activityBucket,
  ageDays,
  bucketCounts,
  daysSinceActivity,
  isNeverActivated,
  isUsing,
  latestDate,
  matchesPreset,
  matchesUsage,
  parseWindowDays,
  totalActivity,
  windowStart,
  activeSourceCount,
  emptyDates,
  toDay,
} from "./usage";
import { customer, usage } from "./test-fixtures";

const NOW = new Date("2026-09-30T09:00:00Z"); // Türkiye günü 2026-09-30

describe("kullanım tanımları", () => {
  it("son etkinlik = kaynakların en yenisi", () => {
    expect(latestDate({ ...emptyDates(), attendance: "2026-09-01", exams: "2026-09-20" })).toBe("2026-09-20");
    expect(latestDate(emptyDates())).toBeNull();
  });

  it("14 gün sınırı dahil: 14 gün önce kullanıyor, 15 gün önce kullanmıyor", () => {
    expect(isUsing(usage({ lastDates: { attendance: "2026-09-16" } }), NOW)).toBe(true);
    expect(isUsing(usage({ lastDates: { attendance: "2026-09-15" } }), NOW)).toBe(false);
    expect(isUsing(usage(), NOW)).toBe(false); // hiç etkinlik yok
    expect(isUsing(null, NOW)).toBe(false);
  });

  it("son etkinlikten bu yana gün; hiç yoksa null", () => {
    expect(daysSinceActivity(usage({ lastDates: { sms: "2026-09-29" } }), NOW)).toBe(1);
    expect(daysSinceActivity(usage(), NOW)).toBeNull();
  });

  it("kovalar: 7 / 14 / 30 / 90 / daha eski / hiç", () => {
    const at = (d: string) => activityBucket(usage({ lastDates: { attendance: d } }), NOW);
    expect(at("2026-09-23")).toBe("d7");
    expect(at("2026-09-16")).toBe("d14");
    expect(at("2026-09-01")).toBe("d30");
    expect(at("2026-07-15")).toBe("d90");
    expect(at("2026-01-01")).toBe("older");
    expect(activityBucket(usage(), NOW)).toBe("never");
    const counts = bucketCounts(
      [customer({ id: "a", usage: usage({ lastDates: { exams: "2026-09-29" } }) }), customer({ id: "b" }), customer({ id: "c", usage: null })],
      NOW
    );
    expect(counts.d7).toBe(1);
    expect(counts.never).toBe(1); // kullanımı hesaplanmamış (null) kurum sayılmaz
  });

  it("hiç aktive olmamış: etkinlik yok + 30 günden eski", () => {
    expect(isNeverActivated(customer({ id: "a", createdAt: "2026-08-01T00:00:00Z" }), NOW)).toBe(true);
    expect(isNeverActivated(customer({ id: "b", createdAt: "2026-09-10T00:00:00Z" }), NOW)).toBe(false); // henüz genç
    expect(isNeverActivated(customer({ id: "c", createdAt: "2026-01-01T00:00:00Z", usage: usage({ lastDates: { exams: "2026-03-01" } }) }), NOW)).toBe(false);
    // hiçbir kaynak okunamadı → bilinmiyor, "hiç yok" denmez
    const blind = usage({ unavailable: ["attendance", "lessonTopics", "assignments", "exams", "announcements", "sms"] });
    expect(isNeverActivated(customer({ id: "d", createdAt: "2026-01-01T00:00:00Z", usage: blind }), NOW)).toBe(false);
    expect(ageDays(null, NOW)).toBeNull();
  });

  it("hazır süzgeçler ve kullanıyor/kullanmıyor", () => {
    const slow = customer({ id: "s", usage: usage({ lastDates: { attendance: "2026-09-01" } }) }); // 29 gün
    const gone = customer({ id: "g", usage: usage({ lastDates: { attendance: "2026-06-01" } }) });
    const never = customer({ id: "n" });
    expect(matchesPreset(slow, "inactive14", NOW)).toBe(true);
    expect(matchesPreset(slow, "noActivity30", NOW)).toBe(false);
    expect(matchesPreset(gone, "noActivity30", NOW)).toBe(true);
    expect(matchesPreset(never, "inactive14", NOW)).toBe(false); // hiç etkinliği olmayan "hareketsiz" değil, "hiç aktive olmamış"
    expect(matchesPreset(never, "noActivity30", NOW)).toBe(true);
    expect(matchesUsage(slow, "notUsing", NOW)).toBe(true);
    expect(matchesUsage(customer({ id: "x", usage: null }), "using", NOW)).toBe(false);
  });

  it("toplam etkinlik, kaynak çeşitliliği, pencere", () => {
    const u = usage({ counts: { attendance: 10, exams: 2 } });
    expect(totalActivity(u.counts)).toBe(12);
    expect(activeSourceCount(u.counts)).toBe(2);
    expect(windowStart(30, NOW)).toBe("2026-08-31");
    expect(parseWindowDays("90")).toBe(90);
    expect(parseWindowDays("500")).toBe(30);
    expect(parseWindowDays(null)).toBe(30);
  });

  it("zaman damgası Türkiye gününe çevrilir (gece yarısı kayması), tarih olduğu gibi kalır", () => {
    expect(toDay("2026-09-29T22:30:00Z")).toBe("2026-09-30"); // Türkiye'de ertesi gün 01:30
    expect(toDay("2026-09-29T20:59:00+00:00")).toBe("2026-09-29");
    expect(toDay("2026-09-29")).toBe("2026-09-29");
    expect(toDay("saçma-değer-x")).toBe("saçma-değe"); // ayrıştırılamazsa ilk 10 karakter
  });
});
