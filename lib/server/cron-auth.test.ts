import { describe, expect, it } from "vitest";
import { checkCronAuth } from "./cron-auth";

describe("checkCronAuth", () => {
  const secret = "s3cr3t-value";

  it("doğru Bearer başlığı kabul edilir", () => {
    expect(checkCronAuth(`Bearer ${secret}`, secret)).toBe("ok");
    expect(checkCronAuth(`bearer   ${secret}  `, secret)).toBe("ok");
  });

  it("secret tanımsız ya da boşsa uç kapalı (başlık ne olursa olsun)", () => {
    expect(checkCronAuth(`Bearer ${secret}`, undefined)).toBe("not-configured");
    expect(checkCronAuth(`Bearer ${secret}`, "")).toBe("not-configured");
    expect(checkCronAuth(`Bearer `, "   ")).toBe("not-configured");
    expect(checkCronAuth(null, null)).toBe("not-configured");
  });

  it("yanlış, eksik ya da başka biçimli başlık reddedilir", () => {
    for (const header of [null, undefined, "", "Bearer", "Bearer ", "Bearer yanlis", `Basic ${secret}`, secret, `Bearer ${secret}x`, `Bearer ${secret.slice(0, -1)}`]) {
      expect(checkCronAuth(header, secret)).toBe("unauthorized");
    }
  });

  it("farklı uzunlukta değer de hatasız reddedilir (timingSafeEqual uzunluk hatası atmaz)", () => {
    expect(checkCronAuth(`Bearer ${"a".repeat(500)}`, secret)).toBe("unauthorized");
  });
});
