import { describe, expect, it } from "vitest";
import type { CrmNote } from "./types";
import {
  buildComplaintNote,
  buildDissatisfactionNote,
  buildNoteContent,
  buildProgramNote,
  latestComplaint,
  latestDissatisfaction,
  latestFollowUpDate,
  mergeNotes,
  parseNoteContent,
  programTags,
} from "./utils";

const note = (id: string, content: string, createdAt: number, leadId = "l1"): CrmNote => ({
  id,
  leadId,
  content,
  authorId: "a1",
  authorName: "Ayşe",
  createdAt,
});

describe("parseNoteContent / buildNoteContent", () => {
  it("önekli notu gidiş-dönüş okur", () => {
    const content = buildNoteContent("DEVIR", ["2026-10-03"], "Karar verici: Ali");
    expect(content).toBe("[DEVIR|2026-10-03]\nKarar verici: Ali");
    expect(parseNoteContent(content)).toEqual({ tag: "DEVIR", args: ["2026-10-03"], body: "Karar verici: Ali" });
  });

  it("düz ve bilinmeyen önekli notlara dokunmaz (taşınan önekler dahil)", () => {
    expect(parseNoteContent("Arandı, dönüş yapacak")).toEqual({ tag: null, args: [], body: "Arandı, dönüş yapacak" });
    expect(parseNoteContent("[BASKA|x] metin").tag).toBeNull();
    // TEKLIF / TAKIP / TAHSILAT kolona ve crm_payments'a taşındı: not öneki olarak okunmaz.
    expect(parseNoteContent("[TAHSILAT|2026-09-26|100]").tag).toBeNull();
    expect(parseNoteContent("[TEKLIF|2026-09-20|acik]").tag).toBeNull();
  });

  it("argümanlardaki ayraçları temizler", () => {
    expect(buildNoteContent("ILETISIM", ["whats|app]"], "")).toBe("[ILETISIM|whats app]");
  });
});

describe("mergeNotes", () => {
  it("id ile tekilleştirir, yeniden eskiye sıralar", () => {
    const a = [note("1", "a", 10), note("2", "b", 30)];
    const b = [note("2", "b", 30), note("3", "c", 20)];
    expect(mergeNotes([a, b, undefined]).map((n) => n.id)).toEqual(["2", "3", "1"]);
  });
});

describe("şikâyet kaydı (madde 7)", () => {
  it("en yeni kaydı döner, alanları doğrular", () => {
    const notes = [
      note("1", buildDissatisfactionNote({ category: "odeme", severity: "yuksek", status: "acik", description: "Fatura" }), 10),
      note("2", "[SIKAYET|kurulum|bilinmez|cozuldu]\nTamam", 20),
      note("3", "düz not", 30),
    ];
    expect(latestDissatisfaction(notes)).toMatchObject({ category: "kurulum", severity: "orta", status: "cozuldu", description: "Tamam" });
    expect(latestDissatisfaction([note("9", "düz", 1)])).toBeNull();
  });

  it("SIKAYET önekiyle yazar", () => {
    const content = buildComplaintNote({ category: "teknik", severity: "yuksek", status: "acik", description: "Giriş yok" });
    expect(content).toBe("[SIKAYET|teknik|yuksek|acik]\nGiriş yok");
    expect(latestComplaint([note("1", content, 10)])).toMatchObject({ severity: "yuksek", status: "acik" });
    // Bilinmeyen kategori (ör. DeepSport'un "olcum"u) varsayılana düşer.
    expect(latestComplaint([note("1", "[SIKAYET|olcum|dusuk|acik]", 10)])).toMatchObject({ category: "teknik", severity: "dusuk" });
  });
});

describe("devir notu", () => {
  it("en yeni devir tarihini okur", () => {
    const notes = [note("1", "[DEVIR|2026-10-01]\nx", 10), note("2", "[DEVIR|2026-11-01]\ny", 20)];
    expect(latestFollowUpDate(notes)).toBe("2026-11-01");
    expect(latestFollowUpDate([note("3", "[DEVIR|yarın]", 1)])).toBeNull();
  });
});

describe("program etiketleri (G113)", () => {
  it("erken yenileme / yıllık ön ödeme etiketlerini yazar ve okur", () => {
    const content = buildProgramNote(["yillik", "erken"], "Yıllık peşin ödedi");
    expect(content).toBe("[PROGRAM|erken|yillik]\nYıllık peşin ödedi");
    expect(parseNoteContent(content)).toMatchObject({ tag: "PROGRAM", args: ["erken", "yillik"], body: "Yıllık peşin ödedi" });
    expect(buildProgramNote([], " düz ")).toBe("düz");
    const notes = [note("1", "[PROGRAM|yillik]", 10), note("2", "[PROGRAM|bilinmez]", 20), note("3", "x", 30)];
    expect(programTags(notes)).toEqual(["yillik"]);
    expect(programTags(undefined)).toEqual([]);
  });
});
