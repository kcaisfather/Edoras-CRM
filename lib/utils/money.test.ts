import { describe, expect, it } from "vitest";
import { parseAmount } from "./money";

describe("parseAmount", () => {
  it.each([
    ["12.500", 12500],
    ["12.500,50", 12500.5],
    ["12500.50", 12500.5],
    ["1250,5", 1250.5],
    ["1.250.000", 1250000],
    ["₺ 45.000 TL", 45000],
    ["0", 0],
  ])("%s → %d", (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });

  it.each(["", "  ", "abc", "-100", "1.2.3,4,5"])("okunamayan %j → null", (input) => {
    expect(parseAmount(input)).toBeNull();
  });
});
