import { describe, expect, it } from "vitest";
import { publicTicketSchema, ticketCreateSchema, ticketNoteSchema, ticketPatchSchema } from "./types";

const inst = "11111111-1111-4111-8111-111111111111";

describe("publicTicketSchema (müşteri formu)", () => {
  const ok = { subject: "Yoklama açılmıyor", name: "Ali Veli", email: "ali@kurum.test" };
  it("geçerli gövde; varsayılanlar dolar", () => {
    expect(publicTicketSchema.parse(ok)).toEqual({ ...ok, description: "", phone: "" });
  });
  it("e-posta ya da telefondan biri zorunlu", () => {
    expect(publicTicketSchema.safeParse({ subject: "Konu başlığı", name: "Ali Veli" }).success).toBe(false);
    expect(publicTicketSchema.safeParse({ subject: "Konu başlığı", name: "Ali Veli", phone: "05321234567" }).success).toBe(true);
  });
  it("kısa konu / ad, geçersiz e-posta ve uzun metin reddedilir", () => {
    expect(publicTicketSchema.safeParse({ ...ok, subject: "ab" }).success).toBe(false);
    expect(publicTicketSchema.safeParse({ ...ok, name: "A" }).success).toBe(false);
    expect(publicTicketSchema.safeParse({ ...ok, email: "bozuk" }).success).toBe(false);
    expect(publicTicketSchema.safeParse({ ...ok, description: "x".repeat(4001) }).success).toBe(false);
  });
  it("kurum alanı yok: gövdede gelirse atılır (kurum token'dan belirlenir)", () => {
    const v = publicTicketSchema.parse({ ...ok, institutionId: inst });
    expect("institutionId" in v).toBe(false);
  });
});

describe("ticketCreateSchema (ekip)", () => {
  it("varsayılanlar: normal öncelik, atanmamış; aktör alanı atılır", () => {
    const v = ticketCreateSchema.parse({ institutionId: inst, subject: "Konu başlığı", createdBy: "x" });
    expect(v).toMatchObject({ priority: "NORMAL", assigneeId: null, description: "" });
    expect("createdBy" in v).toBe(false);
  });
  it("geçersiz kurum, kısa konu ve bilinmeyen öncelik reddedilir", () => {
    expect(ticketCreateSchema.safeParse({ institutionId: "x", subject: "Konu başlığı" }).success).toBe(false);
    expect(ticketCreateSchema.safeParse({ institutionId: inst, subject: "ab" }).success).toBe(false);
    expect(ticketCreateSchema.safeParse({ institutionId: inst, subject: "Konu başlığı", priority: "URGENT" }).success).toBe(false);
  });
});

describe("ticketPatchSchema ve ticketNoteSchema", () => {
  it("boş gövde reddedilir; tek alan yeter; atanan null olabilir", () => {
    expect(ticketPatchSchema.safeParse({}).success).toBe(false);
    expect(ticketPatchSchema.safeParse({ status: "RESOLVED" }).success).toBe(true);
    expect(ticketPatchSchema.safeParse({ assigneeId: null }).success).toBe(true);
    expect(ticketPatchSchema.safeParse({ status: "CLOSED" }).success).toBe(false);
  });
  it("not boş olamaz", () => {
    expect(ticketNoteSchema.safeParse({ body: "   " }).success).toBe(false);
    expect(ticketNoteSchema.parse({ body: " arandı " }).body).toBe("arandı");
  });
});
