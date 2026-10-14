import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown } from "./markdown";
import { isEdorasRootName, meetingFirstLine, meetingTemplate, nameKey, parseKcaTimestamp, parseMeetingText, parseTrDate, stripMeetingCode } from "./rules";
import { kcaContactCreateSchema, kcaContactPatchSchema, kcaMeetingCreateSchema, kcaTaskCreateSchema, kcaTaskPatchSchema } from "./types";

describe("kurallar (KCA Panel ile aynı)", () => {
  it("nameKey: Türkçe harfler, büyük/küçük, boşluk ve noktalama", () => {
    expect(nameKey("Ümit Abi")).toBe("umitabi");
    expect(nameKey("IŞIK İnanç")).toBe("isikinanc");
    expect(nameKey(" EDORAS ")).toBe("edoras");
  });

  it("Edoras kökü yalnız tam ad: 'Edoras Eski' / 'Edoras Mobil' kök değil", () => {
    expect(isEdorasRootName("Edoras")).toBe(true);
    expect(isEdorasRootName("EDORAS")).toBe(true);
    expect(isEdorasRootName("Edoras Eski")).toBe(false);
    expect(isEdorasRootName("DeepSport")).toBe(false);
  });

  it("parseTrDate: GG.AA(.YYYY), ISO, bugün / dün / yarın; geçersiz tarih null", () => {
    const today = "2026-10-14";
    expect(parseTrDate("20.10", today)).toBe("2026-10-20");
    expect(parseTrDate("5/1/27", today)).toBe("2027-01-05");
    expect(parseTrDate("2026-11-02 sabah", today)).toBe("2026-11-02");
    expect(parseTrDate("Bugün", today)).toBe(today);
    expect(parseTrDate("dün", today)).toBe("2026-10-13");
    expect(parseTrDate("yarın", today)).toBe("2026-10-15");
    expect(parseTrDate("31.02.2026", today)).toBeNull();
    expect(parseTrDate("gelecek hafta", today)).toBeNull();
  });

  it("toplantı başlık satırları (ilk 15 satır) ve #toplantı kodu", () => {
    const body = stripMeetingCode("#toplantı: \nTarih: 14.10\nKonu: Vizyon Koleji\nFirma: Edoras\n- Katılanlar: Abdülkadir, Ümit Abi\nNotlar:");
    expect(body.startsWith("Tarih:")).toBe(true);
    expect(parseMeetingText(body, "2026-10-14")).toEqual({ date: "2026-10-14", title: "Vizyon Koleji", company: "Edoras", participants: "Abdülkadir, Ümit Abi" });
    expect(stripMeetingCode("#toplantılar listesi")).toBe("#toplantılar listesi");
    expect(meetingFirstLine("Tarih: 14.10\n\n  Yatırımcı görüşmesi  \nx")).toBe("Yatırımcı görüşmesi");
  });

  it("şablon tarihi ve KCA zaman damgası (UTC)", () => {
    expect(meetingTemplate("2026-10-14").split("\n")[0]).toBe("# Edoras — Toplantı Notları 14.10.2026");
    expect(parseKcaTimestamp("2026-10-14 08:30:00")?.toISOString()).toBe("2026-10-14T08:30:00.000Z");
    expect(parseKcaTimestamp(null)).toBeNull();
  });
});

describe("gövde şemaları", () => {
  it("görev aç: boş alanlar null, öncelik varsayılan normal, tarih doğrulanır", () => {
    expect(kcaTaskCreateSchema.parse({ projectId: 3, title: "  Sözleşme  ", subject: "", dueDate: "" })).toEqual({
      projectId: 3,
      title: "Sözleşme",
      subject: null,
      description: null,
      assigneeId: null,
      priority: "normal",
      dueDate: null,
      meetingId: null,
    });
    expect(kcaTaskCreateSchema.safeParse({ projectId: 3, title: "x", dueDate: "2026-02-30" }).success).toBe(false);
    expect(kcaTaskCreateSchema.safeParse({ projectId: 0, title: "x" }).success).toBe(false);
    expect(kcaTaskCreateSchema.safeParse({ projectId: 3, title: "x".repeat(301) }).success).toBe(false);
  });

  it("kısmi güncelleme: gövdede olmayan alan undefined kalır (silinmez); boş gövde reddedilir", () => {
    expect(kcaTaskPatchSchema.parse({ status: "done" })).toEqual({ status: "done" });
    expect(kcaTaskPatchSchema.parse({ description: "", dueDate: null, assigneeId: null })).toEqual({ description: null, dueDate: null, assigneeId: null });
    expect(kcaTaskPatchSchema.safeParse({}).success).toBe(false);
    expect(kcaTaskPatchSchema.safeParse({ status: "closed" }).success).toBe(false);
    expect(kcaContactPatchSchema.parse({ phone: "" })).toEqual({ phone: null });
    expect(kcaContactPatchSchema.parse({ name: "Ali" })).toEqual({ name: "Ali" });
  });

  it("toplantı ve kişi: varsayılanlar", () => {
    expect(kcaMeetingCreateSchema.parse({ body: "not", projectId: 1 })).toEqual({
      body: "not",
      projectId: 1,
      title: null,
      date: null,
      participants: null,
      status: null,
      shared: false,
      ai: true,
    });
    expect(kcaContactCreateSchema.parse({ name: "Ali", projectId: 1 })).toMatchObject({ status: "todo", organization: null, nextDate: null });
    expect(kcaContactCreateSchema.safeParse({ name: " ", projectId: 1 }).success).toBe(false);
  });
});

describe("toplantı notu Markdown'ı", () => {
  it("şablon: başlıklar, tablolar (ayırıcı satırsız), onay kutulu madde", () => {
    const blocks = parseMarkdown(meetingTemplate("2026-10-14").replace("| 1 |  |  | Orta |", "| 1 | **Teklif** hazırla | Kamil | Yüksek |"));
    expect(blocks[0]).toEqual({ type: "heading", level: 1, text: [{ type: "text", text: "Edoras — Toplantı Notları 14.10.2026" }] });
    const tables = blocks.filter((b) => b.type === "table");
    expect(tables).toHaveLength(2);
    const action = tables[0];
    if (action.type !== "table") throw new Error();
    expect(action.header.map((c) => c.map((x) => x.text).join(""))).toEqual(["Not #", "Aksiyon", "Sorumlu", "Öncelik", "Hedef", "Çıktı", "Durum"]);
    expect(action.rows).toHaveLength(1);
    expect(action.rows[0][1]).toEqual([{ type: "bold", text: "Teklif" }, { type: "text", text: " hazırla" }]);
    expect(action.rows[0]).toHaveLength(7);
    const checks = blocks.find((b) => b.type === "list" && b.items.some((i) => i.checked !== null));
    expect(checks).toBeTruthy();
  });

  it("madde, numaralı liste, paragraf; [x] işaretli", () => {
    expect(parseMarkdown("- bir\n* iki\n\n1. ilk\n2) ikinci\n- [x] bitti\nDüz satır\nikinci satır")).toEqual([
      { type: "list", ordered: false, items: [{ checked: null, text: [{ type: "text", text: "bir" }] }, { checked: null, text: [{ type: "text", text: "iki" }] }] },
      { type: "list", ordered: true, items: [{ checked: null, text: [{ type: "text", text: "ilk" }] }, { checked: null, text: [{ type: "text", text: "ikinci" }] }] },
      { type: "list", ordered: false, items: [{ checked: true, text: [{ type: "text", text: "bitti" }] }] },
      { type: "paragraph", lines: [[{ type: "text", text: "Düz satır" }], [{ type: "text", text: "ikinci satır" }]] },
    ]);
  });

  it("bağlantı yalnız http(s); javascript: ve HTML düz metin kalır", () => {
    expect(parseInline("bak https://edorasapp.ai/x. ve [doc](https://docs.test/a)")).toEqual([
      { type: "text", text: "bak " },
      { type: "link", text: "https://edorasapp.ai/x", href: "https://edorasapp.ai/x" },
      { type: "text", text: ". ve " },
      { type: "link", text: "doc", href: "https://docs.test/a" },
    ]);
    expect(parseInline("[tıkla](javascript:alert(1)) <img src=x onerror=alert(1)>")).toEqual([
      { type: "text", text: "[tıkla](javascript:alert(1)) <img src=x onerror=alert(1)>" },
    ]);
  });
});
