import { describe, expect, it } from "vitest";
import { appendEntry, maskPii, normalizePagePath, type ClientErrorEntry } from "./client-errors";

describe("maskPii", () => {
  it("masks emails, phones and JWTs", () => {
    const out = maskPii("user ali@firma.com phone +90 532 123 45 67 token eyJhbGci.eyJzdWIi.sig-_x");
    expect(out).toBe("user [email] phone [phone] token [token]");
  });
  it("leaves ordinary text alone", () => {
    expect(maskPii("Cannot read properties of undefined (reading 'id')")).toBe(
      "Cannot read properties of undefined (reading 'id')"
    );
  });
});

describe("appendEntry", () => {
  const base: ClientErrorEntry = { at: 1000, source: "window", name: "Error", message: "boom", path: "/crm" };
  it("prepends and caps the list", () => {
    let list: ClientErrorEntry[] = [];
    for (let i = 0; i < 5; i++) list = appendEntry(list, { ...base, message: `m${i}`, at: i * 10_000 }, 3);
    expect(list.map((e) => e.message)).toEqual(["m4", "m3", "m2"]);
  });
  it("swallows the same error repeated within 3 seconds", () => {
    const list = appendEntry([base], { ...base, at: 2500 });
    expect(list).toHaveLength(1);
    expect(appendEntry([base], { ...base, at: 5000 })).toHaveLength(2);
  });
});

describe("normalizePagePath", () => {
  it("strips locale and collapses ids", () => {
    expect(normalizePagePath("/tr/trainers/abc123XYZ789")).toBe("/trainers/:id");
    expect(normalizePagePath("/en/growth/renewals")).toBe("/growth/renewals");
    expect(normalizePagePath("/tr")).toBe("/");
  });
});
