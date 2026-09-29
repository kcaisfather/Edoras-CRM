import { describe, expect, it } from "vitest";
import { canAccessPathFor, filterNavGroups, homePathFor, isPublicPath, panelRoleOf } from "./permissions";

describe("permissions", () => {
  it("rol bilinmiyorsa en dar yetki", () => {
    expect(panelRoleOf(null)).toBe("CRM_AGENT");
    expect(panelRoleOf(undefined)).toBe("CRM_AGENT");
    expect(panelRoleOf({ id: "u", email: null, fullName: null, role: "ADMIN" })).toBe("ADMIN");
  });

  it("CRM_AGENT yalnız izinli yollara girer", () => {
    expect(canAccessPathFor("CRM_AGENT", "/institutions")).toBe(true);
    expect(canAccessPathFor("CRM_AGENT", "/institutions/abc")).toBe(true);
    expect(canAccessPathFor("CRM_AGENT", "/institutions?filter=demo")).toBe(true);
    expect(canAccessPathFor("CRM_AGENT", "/dashboard")).toBe(true);
    expect(canAccessPathFor("CRM_AGENT", "/settings")).toBe(true);
    expect(canAccessPathFor("CRM_AGENT", "/payments")).toBe(false);
    expect(canAccessPathFor("ADMIN", "/payments")).toBe(true);
  });

  it("benzer önekleri eşlemez", () => {
    expect(canAccessPathFor("CRM_AGENT", "/institutionsx")).toBe(false);
  });

  it("ana sayfa", () => {
    expect(homePathFor("ADMIN")).toBe("/dashboard");
    expect(homePathFor("CRM_AGENT")).toBe("/dashboard");
  });

  it("herkese açık yol yalnız giriş", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/institutions")).toBe(false);
    expect(isPublicPath(null)).toBe(false);
  });
});

describe("filterNavGroups", () => {
  const groups = [
    { key: "main", items: [{ href: "/dashboard" }] },
    { key: "customers", labelKey: "sidebarCustomers", items: [{ href: "/institutions" }] },
    { key: "finance", labelKey: "sidebarFinance", items: [{ href: "/payments", adminOnly: true }] },
  ];

  it("yönetici her şeyi görür", () => {
    const out = filterNavGroups(groups, { isAdmin: true, canAccessPath: (h) => canAccessPathFor("ADMIN", h) });
    expect(out.map((g) => g.key)).toEqual(["main", "customers", "finance"]);
  });

  it("CRM_AGENT yönetici öğelerini ve boş grupları görmez", () => {
    const out = filterNavGroups(groups, { isAdmin: false, canAccessPath: (h) => canAccessPathFor("CRM_AGENT", h) });
    expect(out.map((g) => g.key)).toEqual(["main", "customers"]);
  });
});
