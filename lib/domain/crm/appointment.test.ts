import { describe, expect, it } from "vitest";
import {
  appointmentCreateSchema,
  appointmentIcsFileName,
  appointmentMs,
  appointmentPatchSchema,
  appointmentTimes,
  buildAppointmentIcs,
  defaultAppointmentDraft,
  draftToAppointment,
  formatAppointmentWhen,
  isAppointmentOverdue,
  istanbulToMs,
  msToIstanbul,
  nextAppointment,
  normalizeMeetingLink,
  validateAppointmentDraft,
  type AppointmentDraft,
} from "./appointment";

const NOW = new Date("2026-10-05T09:00:00Z"); // İstanbul 12:00
const draft = (over: Partial<AppointmentDraft> = {}): AppointmentDraft => ({
  date: "2026-10-06",
  time: "10:00",
  mode: "ONLINE",
  link: "",
  location: "",
  note: "",
  ...over,
});

describe("İstanbul saati", () => {
  it("sabit UTC+3 ile gidip gelir", () => {
    expect(new Date(istanbulToMs("2026-10-06", "10:00")).toISOString()).toBe("2026-10-06T07:00:00.000Z");
    expect(msToIstanbul(Date.parse("2026-10-06T21:30:00Z"))).toEqual({ date: "2026-10-07", time: "00:30" });
  });
  it("15 dakikalık 96 saat seçeneği", () => {
    const t = appointmentTimes();
    expect(t).toHaveLength(96);
    expect(t[0]).toBe("00:00");
    expect(t[95]).toBe("23:45");
  });
  it("gecikme tarih + saate bakar", () => {
    expect(isAppointmentOverdue({ date: "2026-10-05", time: "11:00" }, NOW)).toBe(true);
    expect(isAppointmentOverdue({ date: "2026-10-05", time: "12:30" }, NOW)).toBe(false);
  });
});

describe("taslak", () => {
  it("varsayılan: yarın 10:00 online, yer adayın il/ilçesi", () => {
    expect(defaultAppointmentDraft({ city: "Ankara", district: "Çankaya" }, NOW)).toMatchObject({
      date: "2026-10-06",
      time: "10:00",
      mode: "ONLINE",
      location: "Çankaya, Ankara",
    });
  });
  it("doğrulama: tarih, saat, geçmiş, link", () => {
    expect(validateAppointmentDraft(draft(), NOW)).toBeNull();
    expect(validateAppointmentDraft(draft({ date: "2026-13-01" }), NOW)).toBe("date");
    expect(validateAppointmentDraft(draft({ time: "25:00" }), NOW)).toBe("time");
    expect(validateAppointmentDraft(draft({ date: "2026-10-05", time: "11:00" }), NOW)).toBe("past");
    expect(validateAppointmentDraft(draft({ link: "ftp://x.com" }), NOW)).toBe("link");
    // Yüz yüzede link denetlenmez.
    expect(validateAppointmentDraft(draft({ mode: "IN_PERSON", link: "geçersiz" }), NOW)).toBeNull();
  });
  it("link: şemasız https alır, geçersiz undefined", () => {
    expect(normalizeMeetingLink("")).toBeNull();
    expect(normalizeMeetingLink("meet.google.com/abc")).toBe("https://meet.google.com/abc");
    expect(normalizeMeetingLink("javascript:alert(1)")).toBeUndefined();
    expect(normalizeMeetingLink("localhost")).toBeUndefined();
  });
  it("türe göre yalnız link ya da yer kalır", () => {
    expect(draftToAppointment(draft({ link: "meet.x.com/a", location: "Ankara" }))).toMatchObject({ link: "https://meet.x.com/a", location: null });
    expect(draftToAppointment(draft({ mode: "IN_PERSON", link: "meet.x.com/a", location: " Ankara " }))).toMatchObject({ link: null, location: "Ankara" });
  });
});

describe("sıradaki randevu", () => {
  const items = [
    { id: "past", date: "2026-10-01", time: "10:00" },
    { id: "far", date: "2026-10-20", time: "10:00" },
    { id: "soon", date: "2026-10-06", time: "09:00" },
  ];
  it("gelecekteki en yakın", () => expect(nextAppointment(items, NOW)?.id).toBe("soon"));
  it("hepsi geçmişse en son geçmiş", () => expect(nextAppointment(items.slice(0, 1), NOW)?.id).toBe("past"));
  it("boşsa null", () => expect(nextAppointment([], NOW)).toBeNull());
  it("biçim: gün + saat", () => expect(formatAppointmentWhen({ date: "2026-10-12", time: "14:30" })).toMatch(/12 Eki\w* 14:30/));
});

describe("şemalar", () => {
  const lead = "11111111-1111-4111-8111-111111111111";
  it("oluşturma: varsayılanlar, aktör alanı yok", () => {
    const v = appointmentCreateSchema.parse({ leadId: lead, date: "2026-10-06", time: "10:00", mode: "ONLINE", createdBy: "x" });
    expect(v).toMatchObject({ link: "", location: "", note: "" });
    expect("createdBy" in v).toBe(false);
  });
  it("oluşturma: geçersiz tarih / saat / tür reddedilir", () => {
    expect(appointmentCreateSchema.safeParse({ leadId: lead, date: "2026-02-30", time: "10:00", mode: "ONLINE" }).success).toBe(false);
    expect(appointmentCreateSchema.safeParse({ leadId: lead, date: "2026-10-06", time: "9:00", mode: "ONLINE" }).success).toBe(false);
    expect(appointmentCreateSchema.safeParse({ leadId: lead, date: "2026-10-06", time: "10:00", mode: "PHONE" }).success).toBe(false);
  });
  it("güncelleme: boş gövde, yalnız tarih ya da kapatırken başka alan reddedilir", () => {
    expect(appointmentPatchSchema.safeParse({}).success).toBe(false);
    expect(appointmentPatchSchema.safeParse({ date: "2026-10-06" }).success).toBe(false);
    expect(appointmentPatchSchema.safeParse({ status: "HELD", mode: "ONLINE" }).success).toBe(false);
    expect(appointmentPatchSchema.safeParse({ status: "SCHEDULED" }).success).toBe(false);
    expect(appointmentPatchSchema.safeParse({ status: "NO_SHOW", note: "geldi ama" }).success).toBe(true);
    expect(appointmentPatchSchema.safeParse({ date: "2026-10-06", time: "11:00" }).success).toBe(true);
  });
});

describe("takvim dosyası (.ics)", () => {
  const appointment = { date: "2026-10-12", time: "14:30", mode: "ONLINE" as const, link: "https://meet.x.com/a", location: null };
  it("İstanbul saati, bir saatlik etkinlik, link ve CRLF", () => {
    const ics = buildAppointmentIcs({ uid: "abc 123", title: "Randevu; Test, A", appointment, now: NOW });
    expect(ics).toContain("DTSTART;TZID=Europe/Istanbul:20261012T143000");
    expect(ics).toContain("DTEND;TZID=Europe/Istanbul:20261012T153000");
    expect(ics).toContain("SUMMARY:Randevu\\; Test\\, A");
    expect(ics).toContain("UID:abc123@edoras-crm");
    expect(ics).toContain("URL:https://meet.x.com/a");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
  it("dosya adı Türkçe karakterleri sadeleştirir", () => {
    expect(appointmentIcsFileName("Şişli Spor Kulübü", "2026-10-12")).toBe("randevu-sisli-spor-kulubu-2026-10-12.ics");
    expect(appointmentIcsFileName("", "2026-10-12")).toBe("randevu-crm-2026-10-12.ics");
  });
  it("appointmentMs ile uyumlu", () => {
    expect(appointmentMs(appointment)).toBe(istanbulToMs("2026-10-12", "14:30"));
  });
});
