import { describe, expect, it } from "vitest";
import { dropColumns, toCsv } from "./csv";

describe("toCsv formül enjeksiyonu", () => {
  it("prefixes text cells that Excel would run as a formula", () => {
    expect(toCsv(["a"], [["=HYPERLINK(\"x\")"], ["+1+1"], ["@SUM(A1)"], ["-2+3"]]).split("\r\n").slice(1)).toEqual([
      `"'=HYPERLINK(""x"")"`,
      "'+1+1",
      "'@SUM(A1)",
      "'-2+3",
    ]);
  });
  it("leaves numbers and numeric text untouched", () => {
    expect(toCsv(["a", "b", "c", "d"], [[-5, "-12,50", "+90 533 000 00 02", "Ali"]])).toBe("a;b;c;d\r\n-5;-12,50;+90 533 000 00 02;Ali");
  });
});

describe("dropColumns", () => {
  it("removes financial columns from header and rows", () => {
    const [h, r] = dropColumns(
      ["Ad", "Tutar", "Tel", "Bakiye"],
      [
        ["A", 100, "1", 5],
        ["B", 0, "2", null],
      ],
      [1, 3],
    );
    expect(h).toEqual(["Ad", "Tel"]);
    expect(r).toEqual([
      ["A", "1"],
      ["B", "2"],
    ]);
  });
  it("keeps everything when nothing to drop", () => {
    const rows = [["x"]];
    expect(dropColumns(["a"], rows, [])).toEqual([["a"], rows]);
  });
});
