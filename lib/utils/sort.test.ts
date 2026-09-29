import { describe, expect, it } from "vitest";
import { compareValues, nextSort, parseSort, sortRows } from "./sort";

describe("nextSort", () => {
  it("cycles off → asc → desc → off, and restarts on another column", () => {
    expect(nextSort(null, "name")).toEqual({ key: "name", dir: "asc" });
    expect(nextSort({ key: "name", dir: "asc" }, "name")).toEqual({ key: "name", dir: "desc" });
    expect(nextSort({ key: "name", dir: "desc" }, "name")).toBeNull();
    expect(nextSort({ key: "name", dir: "desc" }, "date")).toEqual({ key: "date", dir: "asc" });
  });
});

describe("parseSort", () => {
  it("accepts only known keys", () => {
    expect(parseSort("date", "desc", ["date", "name"] as const)).toEqual({ key: "date", dir: "desc" });
    expect(parseSort("date", "x", ["date"] as const)).toEqual({ key: "date", dir: "asc" });
    expect(parseSort("hack", "asc", ["date"] as const)).toBeNull();
    expect(parseSort(null, "asc", ["date"] as const)).toBeNull();
  });
});

describe("compareValues / sortRows", () => {
  it("uses Turkish collation for text", () => {
    const names = ["Zeynep", "çağla", "Ali", "İsmail", "ömer"];
    expect(sortRows(names, { key: "n", dir: "asc" }, { n: (x) => x })).toEqual(["Ali", "çağla", "İsmail", "ömer", "Zeynep"]);
  });
  it("keeps empty values last in both directions", () => {
    const rows = [{ d: 3 }, { d: null }, { d: 1 }, { d: undefined }, { d: 2 }];
    const asc = sortRows(rows, { key: "d", dir: "asc" }, { d: (r) => r.d }).map((r) => r.d);
    const desc = sortRows(rows, { key: "d", dir: "desc" }, { d: (r) => r.d }).map((r) => r.d);
    expect(asc.slice(0, 3)).toEqual([1, 2, 3]);
    expect(desc.slice(0, 3)).toEqual([3, 2, 1]);
    expect(asc.slice(3).every((v) => v == null)).toBe(true);
    expect(desc.slice(3).every((v) => v == null)).toBe(true);
  });
  it("is stable and returns a copy when off", () => {
    const rows = [{ k: 1, id: "a" }, { k: 1, id: "b" }, { k: 0, id: "c" }];
    expect(sortRows(rows, { key: "k", dir: "asc" }, { k: (r) => r.k }).map((r) => r.id)).toEqual(["c", "a", "b"]);
    const off = sortRows(rows, null, { k: (r) => r.k });
    expect(off).toEqual(rows);
    expect(off).not.toBe(rows);
  });
  it("sorts booleans (e.g. using) numerically", () => {
    expect(compareValues(true, false, "desc")).toBeLessThan(0);
  });
});
