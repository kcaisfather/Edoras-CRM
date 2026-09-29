import { describe, expect, it } from "vitest";
import { detectDelimiter, fileKind, parseDelimited, tableFromMatrix, ImportFileError, decodeText } from "./parse";
import { guessMapping, hasIdentityField, normalizeHeader } from "./fields";
import { buildRecords, splitFullName, hasInvalidEmail, hasInvalidPhone } from "./records";
import { findDuplicateGroups, mergeRecords, planImport, type ExistingContact } from "./duplicates";
import { crmLeadToExisting, institutionToExisting } from "./existing";
import { normalizeImportEmail } from "./normalize";
import { chunk, runSequential } from "./run";
import { TEMPLATE_HEADERS } from "./template";
import type { ImportRecord } from "./records";

describe("parse", () => {
  it("detects delimiter", () => {
    expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
    expect(detectDelimiter("a,b,c")).toBe(",");
    expect(detectDelimiter("a\tb\tc")).toBe("\t");
    expect(detectDelimiter("single")).toBe(";");
  });

  it("parses quotes, escaped quotes, embedded delimiters and newlines, BOM", () => {
    const text = '﻿Ad;Not\r\n"Ali";"a;b ""c""\nd"\r\nVeli;x\n';
    expect(parseDelimited(text)).toEqual([
      ["Ad", "Not"],
      ["Ali", 'a;b "c"\nd'],
      ["Veli", "x"],
    ]);
  });

  it("builds a table: first non-empty row is header, empty rows skipped, row numbers kept", () => {
    const t = tableFromMatrix([
      ["", ""],
      ["Ad", "Telefon", ""],
      ["Ali", "05320000001", ""],
      ["", "", ""],
      ["Veli", 5330000002, null],
    ]);
    expect(t.headers).toEqual(["Ad", "Telefon"]);
    expect(t.rows).toEqual([
      ["Ali", "05320000001"],
      ["Veli", "5330000002"],
    ]);
    expect(t.rowNumbers).toEqual([3, 5]);
  });

  it("names empty headers and formats dates", () => {
    const t = tableFromMatrix([
      ["Ad", ""],
      ["Ali", new Date(2026, 0, 5)],
    ]);
    expect(t.headers).toEqual(["Ad", "Sütun 2"]);
    expect(t.rows[0][1]).toBe("2026-01-05");
  });

  it("throws on empty and on too many rows", () => {
    expect(() => tableFromMatrix([["Ad"]])).toThrow(ImportFileError);
    expect(() => tableFromMatrix([])).toThrow(ImportFileError);
    const many = [["Ad"], ...Array.from({ length: 5001 }, (_, i) => [`K${i}`])];
    expect(() => tableFromMatrix(many)).toThrow(expect.objectContaining({ code: "tooMany" }));
  });

  it("file kinds", () => {
    expect(fileKind("liste.XLSX")).toBe("xlsx");
    expect(fileKind("liste.xls")).toBe("xls");
    expect(fileKind("liste.csv")).toBe("csv");
    expect(fileKind("liste.pdf")).toBeNull();
  });

  it("decodes Windows-1254 when UTF-8 is invalid", () => {
    // "Şehir" in windows-1254: Ş = 0xDE
    const bytes = new Uint8Array([0xde, 0x65, 0x68, 0x69, 0x72]);
    expect(decodeText(bytes.buffer)).toBe("Şehir");
    expect(decodeText(new TextEncoder().encode("Ülke").buffer as ArrayBuffer)).toBe("Ülke");
  });
});

describe("fields", () => {
  it("normalizes Turkish headers", () => {
    expect(normalizeHeader("Cep Telefonu")).toBe("ceptelefonu");
    expect(normalizeHeader("İlçe")).toBe("ilce");
    expect(normalizeHeader("E-posta")).toBe("eposta");
    expect(normalizeHeader("Kurum Adı")).toBe("kurumadi");
  });

  it("guesses the template mapping exactly", () => {
    const m = guessMapping([...TEMPLATE_HEADERS]);
    expect(m).toEqual({
      firstName: 0,
      lastName: 1,
      organization: 2,
      phone: 3,
      email: 4,
      city: 5,
      district: 6,
      branch: 7,
      note: 8,
    });
  });

  it("guesses full name and contains-matches", () => {
    const m = guessMapping(["Yetkili Adı Soyadı", "Kurum", "GSM No", "Mail Adresi", "İl"]);
    expect(m.fullName).toBe(0);
    expect(m.organization).toBe(1);
    expect(m.phone).toBe(2);
    expect(m.email).toBe(3);
    expect(m.city).toBe(4);
    expect(m.firstName).toBeUndefined();
  });

  it("maps Edoras program / type headers and keeps DeepSport's branch header", () => {
    expect(guessMapping(["Dershane", "Kurum Türü"])).toEqual({ organization: 0, branch: 1 });
    expect(guessMapping(["Kulüp", "Branş"])).toEqual({ organization: 0, branch: 1 });
    expect(guessMapping(["Okul Adı", "Sınav"])).toEqual({ organization: 0, branch: 1 });
  });

  it("identity field check", () => {
    expect(hasIdentityField({ city: 1 })).toBe(false);
    expect(hasIdentityField({ phone: 0 })).toBe(true);
  });
});

function rec(id: string, over: Partial<ImportRecord> = {}): ImportRecord {
  return {
    id,
    rowNumber: Number(id.slice(1)),
    firstName: "",
    lastName: "",
    organization: "",
    phoneRaw: "",
    phone: null,
    emailRaw: "",
    email: null,
    city: "",
    district: "",
    branch: "",
    note: "",
    ...over,
  };
}

describe("records", () => {
  it("splits full names", () => {
    expect(splitFullName("Ahmet Can Yılmaz")).toEqual(["Ahmet Can", "Yılmaz"]);
    expect(splitFullName("Ahmet")).toEqual(["Ahmet", ""]);
  });

  it("builds records with normalized phone/email and skips empty rows", () => {
    const table = {
      headers: ["Ad Soyad", "Telefon", "E-posta", "Şehir"],
      rows: [
        ["Ali Veli", "0532 000 00 01", " ALI@X.COM ", "İzmir"],
        ["", "", "", "Bursa"],
        ["", "12", "ali@x", ""],
      ],
      rowNumbers: [2, 3, 4],
    };
    const { records, emptyRows } = buildRecords(table, guessMapping(table.headers));
    expect(emptyRows).toBe(1);
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      id: "r2",
      firstName: "Ali",
      lastName: "Veli",
      phone: "+905320000001",
      email: "ali@x.com",
      city: "İzmir",
    });
    expect(hasInvalidPhone(records[1])).toBe(true);
    // Veritabanı kuralı: alan adında nokta olmalı.
    expect(hasInvalidEmail(records[1])).toBe(true);
  });

  it("email normalization matches the database rule", () => {
    expect(normalizeImportEmail(" A@B.CO ")).toBe("a@b.co");
    expect(normalizeImportEmail("a@b")).toBeNull();
    expect(normalizeImportEmail("a b@c.co")).toBeNull();
    expect(normalizeImportEmail(`${"x".repeat(250)}@b.co`)).toBeNull();
  });
});

describe("existing", () => {
  it("maps CRM leads and institution contacts to comparable contacts", () => {
    expect(
      crmLeadToExisting({ id: "L1", organizationName: "Kurum", contactPhone: "0532 000 00 09", contactEmail: "X@Y.co", status: "TAKIPTE" })
    ).toMatchObject({ source: "crm", name: "Kurum", phone: "+905320000009", email: "x@y.co", context: "TAKIPTE" });
    const base = {
      id: "I1",
      name: "Işık Koleji",
      program: null,
      isActive: true,
      missingInEdoras: false,
      isInternal: false,
      createdAt: null,
      licenseEndsOn: null,
    };
    expect(institutionToExisting({ ...base, crm: null })).toBeNull();
    expect(
      institutionToExisting({
        ...base,
        crm: {
          status: "DEMO",
          contactName: "Ayşe Demir",
          contactPhone: "+905320000010",
          contactEmail: "ayse@isik.test",
          demoStartedAt: null,
          demoEndsAt: null,
          convertedAt: null,
          billingComplete: false,
        },
      })
    ).toMatchObject({ source: "institution", id: "I1", name: "Ayşe Demir", organization: "Işık Koleji", phone: "+905320000010" });
  });
});

describe("duplicates", () => {
  const a = rec("r2", { firstName: "Ahmet", phone: "+905320000001", phoneRaw: "0532 000 00 01", organization: "Kurum A" });
  const b = rec("r3", { firstName: "Mehmet", phone: "+905320000001", phoneRaw: "532-000-0001", city: "Ankara", note: "x" });
  const c = rec("r4", { firstName: "Ayşe", email: "ayse@x.com", emailRaw: "ayse@x.com" });
  const d = rec("r5", { firstName: "Can", phone: "+905330000009", phoneRaw: "05330000009" });
  const e = rec("r6", { firstName: "Can2", email: "ayse@x.com", emailRaw: "AYSE@x.com", note: "y" });
  const existing: ExistingContact[] = [
    { source: "crm", id: "L1", name: "Can K.", phone: "+905330000009", email: null },
    { source: "coldList", id: "P1", name: "Zeynep", phone: null, email: "nobody@x.com" },
  ];

  it("groups in-file phone duplicates, email duplicates and existing matches", () => {
    const groups = findDuplicateGroups([a, b, c, d, e], existing);
    expect(groups).toHaveLength(3);
    expect(groups[0]).toMatchObject({ kind: "phone", value: "+905320000001", recordIds: ["r2", "r3"], existing: [] });
    expect(groups[1]).toMatchObject({ kind: "email", value: "ayse@x.com", recordIds: ["r4", "r6"] });
    expect(groups[2]).toMatchObject({ kind: "phone", value: "+905330000009", recordIds: ["r5"] });
    expect(groups[2].existing.map((x) => x.id)).toEqual(["L1"]);
  });

  it("links records transitively (phone of one, email of another)", () => {
    const x = rec("r2", { phone: "+905320000001", email: "a@x.com" });
    const y = rec("r3", { email: "a@x.com" });
    const z = rec("r4", { phone: "+905320000001" });
    const groups = findDuplicateGroups([x, y, z], []);
    expect(groups).toHaveLength(1);
    expect(groups[0].recordIds).toEqual(["r2", "r3", "r4"]);
    expect(groups[0].kind).toBe("phone");
  });

  it("merges records: first non-empty per field, notes joined", () => {
    const m = mergeRecords([a, b]);
    expect(m).toMatchObject({
      id: "r2",
      firstName: "Ahmet",
      organization: "Kurum A",
      city: "Ankara",
      note: "x",
      phone: "+905320000001",
    });
  });

  it("plans skip/merge", () => {
    const records = [a, b, c, d, e, rec("r7", { firstName: "Tek" })];
    const groups = findDuplicateGroups(records, existing);
    const [g1, g2, g3] = groups;

    const skipAll = planImport(records, groups, {});
    // g1: ilk satır kalır; g2: ilk satır kalır; g3 (mevcut kayıt): hepsi atlanır; r7 eklenir
    expect(skipAll.stats).toEqual({ create: 3, merged: 0, skipped: 3 });
    expect(skipAll.creates.map((r) => r.id)).toEqual(["r2", "r4", "r7"]);

    const mixed = planImport(records, groups, { [g1.key]: "merge", [g2.key]: "skip", [g3.key]: "merge" });
    expect(mixed.stats).toEqual({ create: 3, merged: 2, skipped: 1 });
    expect(mixed.mergeIntoExisting).toHaveLength(1);
    expect(mixed.mergeIntoExisting[0].existing.id).toBe("L1");
    expect(mixed.creates.map((r) => r.id)).toEqual(["r2", "r4", "r7"]);
    expect(mixed.creates[0]).toMatchObject({ city: "Ankara", note: "x" });

    const mergeAll = planImport(records, groups, {}, "merge");
    expect(mergeAll.stats).toEqual({ create: 3, merged: 3, skipped: 0 });
  });
});

describe("runSequential", () => {
  it("runs in order, collects failures and reports progress", async () => {
    const order: number[] = [];
    const progress: number[] = [];
    const r = await runSequential(
      [1, 2, 3],
      async (n) => {
        order.push(n);
        if (n === 2) throw new Error("boom");
      },
      { onProgress: (done) => progress.push(done) }
    );
    expect(order).toEqual([1, 2, 3]);
    expect(progress).toEqual([1, 2, 3]);
    expect(r).toMatchObject({ ok: 2, stopped: false, remaining: 0 });
    expect(r.failed).toMatchObject([{ item: 2, index: 1 }]);
    expect((r.failed[0].error as Error).message).toBe("boom");
  });

  it("aborts after consecutive failures", async () => {
    let calls = 0;
    const r = await runSequential(
      [1, 2, 3, 4, 5],
      async () => {
        calls++;
        throw new Error("down");
      },
      { maxConsecutiveFailures: 2 }
    );
    expect(calls).toBe(2);
    expect(r).toMatchObject({ ok: 0, stopped: true, aborted: true, remaining: 3 });
  });

  it("stops when asked", async () => {
    let calls = 0;
    const r = await runSequential([1, 2, 3, 4], async () => void calls++, { shouldStop: () => calls >= 2 });
    expect(calls).toBe(2);
    expect(r).toMatchObject({ ok: 2, stopped: true, remaining: 2 });
  });

  it("chunks", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
  });
});
