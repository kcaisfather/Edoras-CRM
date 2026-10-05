import { describe, expect, it } from "vitest";
import { ApiError } from "./client";
import { apiErrorFieldDetail } from "./errors";

describe("apiErrorFieldDetail", () => {
  it("alan mesajlarını tekrarsız birleştirir (alan adı gösterilmez)", () => {
    const err = new ApiError("VALIDATION", 400, "VALIDATION", { institutionName: "Kurum adı zorunlu", city: "İl zorunlu", district: "İl zorunlu" });
    expect(apiErrorFieldDetail(err)).toBe("Kurum adı zorunlu; İl zorunlu");
  });
  it("alan yoksa ya da ApiError değilse null", () => {
    expect(apiErrorFieldDetail(new ApiError("VALIDATION", 400, "VALIDATION"))).toBeNull();
    expect(apiErrorFieldDetail(new ApiError("VALIDATION", 400, "VALIDATION", {}))).toBeNull();
    expect(apiErrorFieldDetail(new Error("x"))).toBeNull();
  });
});
