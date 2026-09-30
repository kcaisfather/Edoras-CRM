import { describe, expect, it } from "vitest";
import { NEW_REPORT_DRAFT, draftFromSubscription, draftToBody, validateDraft } from "./draft";

const A = "11111111-1111-4111-8111-111111111111";

describe("rapor taslağı", () => {
  it("yeni taslak varsayılanları: günlük 08:30, tüm bölümler, aktif, alıcı yok", () => {
    expect(NEW_REPORT_DRAFT).toMatchObject({ id: null, frequency: "DAILY", time: "08:30", active: true, recipientIds: [] });
    expect(NEW_REPORT_DRAFT.sections).toHaveLength(6);
    expect(validateDraft(NEW_REPORT_DRAFT)).toEqual(["nameRequired", "noRecipients"]);
  });

  it("doğrulama: ad, alıcı, saat, bölüm", () => {
    expect(validateDraft({ ...NEW_REPORT_DRAFT, name: " ", recipientIds: [], time: "25:00", sections: [] })).toEqual([
      "nameRequired",
      "noRecipients",
      "invalidTime",
      "noSections",
    ]);
    expect(validateDraft({ ...NEW_REPORT_DRAFT, name: "Sabah", recipientIds: [A] })).toEqual([]);
  });

  it("gövde: kullanılmayan gün boşalır, bölümler sıralanır", () => {
    const d = { ...NEW_REPORT_DRAFT, name: " Sabah ", recipientIds: [A], sections: ["salesTotal" as const, "todayTasks" as const], weekday: 4, dayOfMonth: 9 };
    expect(draftToBody(d)).toMatchObject({ name: "Sabah", weekday: null, dayOfMonth: null, sections: ["todayTasks", "salesTotal"] });
    expect(draftToBody({ ...d, frequency: "WEEKLY" })).toMatchObject({ weekday: 4, dayOfMonth: null });
    expect(draftToBody({ ...d, frequency: "MONTHLY" })).toMatchObject({ weekday: null, dayOfMonth: 9 });
  });

  it("kayıtlı abonelikten taslak: boş gün varsayılana düşer", () => {
    const d = draftFromSubscription({
      id: "s1",
      name: "Rapor",
      recipientIds: [A],
      frequency: "DAILY",
      time: "09:00",
      weekday: null,
      dayOfMonth: null,
      sections: ["todayTasks"],
      timezone: "Europe/Istanbul",
      active: false,
      lastSentAt: null,
      nextRunAt: 0,
      createdByName: null,
      createdAt: 0,
      lastRun: null,
    });
    expect(d).toMatchObject({ id: "s1", weekday: 1, dayOfMonth: 1, active: false });
  });
});
