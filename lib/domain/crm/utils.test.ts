import { describe, expect, it } from "vitest";
import {
  amountForSave,
  amountFromInput,
  amountToInput,
  formatCrmDate,
  getLeadDisplayName,
  getLeadTitle,
  getRemainingAmount,
  splitFullName,
} from "./utils";

describe("amountFromInput (EK-2)", () => {
  it("boş / okunamayan tutar 0 TL; ondalık ve TR yazımı okunur", () => {
    expect(amountFromInput("")).toBe(0);
    expect(amountFromInput("  ")).toBe(0);
    expect(amountFromInput(undefined)).toBe(0);
    expect(amountFromInput("-5")).toBe(0);
    expect(amountFromInput("abc")).toBe(0);
    expect(amountFromInput("1250.5")).toBe(1250.5);
    expect(amountFromInput("12.500,50")).toBe(12500.5);
  });
});

describe("amountForSave", () => {
  it("dokunulmamış boş tutar değişmez", () => {
    expect(amountForSave("", null)).toBeUndefined();
    expect(amountForSave("  ", undefined)).toBeUndefined();
  });
  it("mevcut tutar silinirse ya da statü gerektiriyorsa 0 TL yazılır", () => {
    expect(amountForSave("", 1500)).toBe(0);
    expect(amountForSave("", null, true)).toBe(0);
  });
  it("girilen değer kullanılır", () => {
    expect(amountForSave("2000", null)).toBe(2000);
  });
  it("form değerine TR biçiminde döner", () => {
    expect(amountToInput(12500.5)).toBe("12500,5");
    expect(amountToInput(null)).toBe("");
  });
});

describe("getLeadTitle", () => {
  it("anlamlı kurum adı başlık, kişi alt satır", () => {
    expect(getLeadTitle({ id: "1", organizationName: "Işıklar Koleji", contactFirstName: "Ali", contactLastName: "Can" })).toEqual({
      title: "Işıklar Koleji",
      subtitle: "Ali Can",
    });
  });
  it("kurum yoksa kişi adı — asla '-' ya da '...' değil", () => {
    for (const org of [null, "", "  ", "-", "...", "…"]) {
      expect(getLeadTitle({ id: "1", organizationName: org, contactFirstName: "Ayşe" })).toEqual({ title: "Ayşe", subtitle: null });
    }
    expect(getLeadTitle({ id: "1", contactEmail: "a@b.co" }).title).toBe("a@b.co");
    expect(getLeadDisplayName({ id: "1", organizationName: "Kurum" })).toBe("Kurum");
  });
});

describe("yardımcılar", () => {
  it("kalan bakiye negatif olmaz", () => {
    expect(getRemainingAmount(1000, 400)).toBe(600);
    expect(getRemainingAmount(100, 250)).toBe(0);
    expect(getRemainingAmount(null, null)).toBe(0);
  });

  it("takvim günü kaymadan biçimlenir", () => {
    expect(formatCrmDate("2026-09-29")).toBe("29.09.2026");
    expect(formatCrmDate(new Date(2026, 0, 5).getTime())).toBe("05.01.2026");
    expect(formatCrmDate(null)).toBe("-");
  });

  it("ad soyadı böler (son kelime soyad)", () => {
    expect(splitFullName("Ayşe Nur Yılmaz")).toEqual({ firstName: "Ayşe Nur", lastName: "Yılmaz" });
    expect(splitFullName("Ayşe")).toEqual({ firstName: "Ayşe", lastName: "" });
    expect(splitFullName(null)).toEqual({ firstName: "", lastName: "" });
  });
});
