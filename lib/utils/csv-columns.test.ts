import { describe, expect, it } from "vitest";
import { dropColumns } from "./csv";

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
