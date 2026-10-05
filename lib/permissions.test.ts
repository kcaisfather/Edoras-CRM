import { describe, expect, it } from "vitest";
import { canAccessPathFor, filterNavGroups, homePathFor, isCronPath, isCustomerPublicPath, isPublicPath, panelRoleOf } from "./permissions";

describe("permissions", () => {
  it("rol bilinmiyorsa en dar yetki", () => {
    expect(panelRoleOf(null)).toBe("CRM_AGENT");
    expect(panelRoleOf(undefined)).toBe("CRM_AGENT");
    expect(panelRoleOf({ id: "u", email: null, fullName: null, role: "ADMIN", isSuper: false })).toBe("ADMIN");
  });

  it("CRM_AGENT yalnız izinli yollara girer", () => {
    expect(canAccessPathFor("CRM_AGENT", "/institutions")).toBe(true);
    expect(canAccessPathFor("CRM_AGENT", "/institutions/abc")).toBe(true);
    expect(canAccessPathFor("CRM_AGENT", "/institutions?filter=demo")).toBe(true);
    expect(canAccessPathFor("CRM_AGENT", "/dashboard")).toBe(true);
    expect(canAccessPathFor("CRM_AGENT", "/settings")).toBe(true);
    expect(canAccessPathFor("CRM_AGENT", "/crm")).toBe(true);
    expect(canAccessPathFor("CRM_AGENT", "/crm/analytics")).toBe(true);
    expect(canAccessPathFor("CRM_AGENT", "/crm?tab=balance&lead=x")).toBe(true);
    expect(canAccessPathFor("CRM_AGENT", "/crmx")).toBe(false);
    expect(canAccessPathFor("CRM_AGENT", "/payments")).toBe(false);
    expect(canAccessPathFor("ADMIN", "/payments")).toBe(true);
  });

  it("CRM_AGENT Görevlerim'e girer, kurallara giremez (yasaklı yol izinli önekten önce denetlenir)", () => {
    expect(canAccessPathFor("CRM_AGENT", "/crm/tasks")).toBe(true);
    expect(canAccessPathFor("CRM_AGENT", "/crm/tasks?b=overdue")).toBe(true);
    expect(canAccessPathFor("CRM_AGENT", "/crm/cold-lists")).toBe(true);
    expect(canAccessPathFor("CRM_AGENT", "/crm/cold-lists?list=x&outcome=UNREACHABLE")).toBe(true);
    expect(canAccessPathFor("CRM_AGENT", "/crm/rules")).toBe(false);
    expect(canAccessPathFor("CRM_AGENT", "/crm/rules/")).toBe(false);
    expect(canAccessPathFor("CRM_AGENT", "/crm/rules?x=1")).toBe(false);
    expect(canAccessPathFor("CRM_AGENT", "/crm/rulesx")).toBe(true);
    expect(canAccessPathFor("ADMIN", "/crm/rules")).toBe(true);
  });

  it("Müşteri Takibi CRM_AGENT'a açık, Müşteri Analizleri yalnız ADMIN'e", () => {
    expect(canAccessPathFor("CRM_AGENT", "/growth/customers")).toBe(true);
    expect(canAccessPathFor("CRM_AGENT", "/growth/customers?tab=renewals&bucket=le60")).toBe(true);
    expect(canAccessPathFor("CRM_AGENT", "/growth/analytics")).toBe(false);
    expect(canAccessPathFor("CRM_AGENT", "/growth")).toBe(false);
    expect(canAccessPathFor("CRM_AGENT", "/growth/customersx")).toBe(false);
    expect(canAccessPathFor("ADMIN", "/growth/analytics")).toBe(true);
  });

  it("benzer önekleri eşlemez", () => {
    expect(canAccessPathFor("CRM_AGENT", "/institutionsx")).toBe(false);
  });

  it("ana sayfa", () => {
    expect(homePathFor("ADMIN")).toBe("/dashboard");
    expect(homePathFor("CRM_AGENT")).toBe("/dashboard");
  });

  it("herkese açık yollar: giriş + müşteriye açık anket sayfası ve uçları", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/s/AbC_123-token")).toBe(true);
    expect(isPublicPath("/api/public/surveys/tok")).toBe(true);
    expect(isPublicPath("/api/public/surveys/tok/responses")).toBe(true);
    expect(isPublicPath("/institutions")).toBe(false);
    expect(isPublicPath("/settings")).toBe(false);
    expect(isPublicPath("/sales")).toBe(false);
    expect(isPublicPath("/api/publicx")).toBe(false);
    expect(isPublicPath("/api/crm/surveys")).toBe(false);
    expect(isPublicPath(null)).toBe(false);
  });

  it("müşteriye açık yol: proxy oturuma dokunmaz; giriş sayfası bu grupta değil", () => {
    expect(isCustomerPublicPath("/s/tok")).toBe(true);
    expect(isCustomerPublicPath("/api/public/surveys/tok")).toBe(true);
    expect(isCustomerPublicPath("/login")).toBe(false);
    expect(isCustomerPublicPath("/crm/surveys")).toBe(false);
    expect(isCustomerPublicPath("/settings")).toBe(false);
  });

  it("CRM_AGENT Anketler'e girer", () => {
    expect(canAccessPathFor("CRM_AGENT", "/crm/surveys")).toBe(true);
  });

  it("Ödeme Geçmişi ve Faturalar yalnız ADMIN (tutar içerir; yollar CRM_AGENT_PATHS'te yok)", () => {
    for (const path of ["/payment-history", "/payment-history?page=2", "/sales/invoices", "/sales/invoices?status=FAILED", "/sales"]) {
      expect(canAccessPathFor("CRM_AGENT", path), path).toBe(false);
      expect(canAccessPathFor("ADMIN", path), path).toBe(true);
    }
  });
});

describe("filterNavGroups", () => {
  it("CRM_AGENT menüde Kurallar'ı görmez, Görevlerim'i görür", () => {
    const groups = [
      { key: "crm", labelKey: "sidebarCrm", items: [{ href: "/crm" }, { href: "/crm/tasks" }] },
      { key: "analysis", labelKey: "sidebarAnalysis", items: [{ href: "/crm/analytics" }, { href: "/crm/rules" }] },
    ];
    const agent = filterNavGroups(groups, { isAdmin: false, canAccessPath: (h) => canAccessPathFor("CRM_AGENT", h) });
    expect(agent.flatMap((g) => g.items.map((i) => i.href))).toEqual(["/crm", "/crm/tasks", "/crm/analytics"]);
    const admin = filterNavGroups(groups, { isAdmin: true, canAccessPath: (h) => canAccessPathFor("ADMIN", h) });
    expect(admin.flatMap((g) => g.items.map((i) => i.href))).toContain("/crm/rules");
  });

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
  it("zamanlayıcı yolu oturumsuzdur ama müşteriye açık değildir", () => {
    expect(isCronPath("/api/cron/reports")).toBe(true);
    expect(isCronPath("/api/cron")).toBe(true);
    expect(isCronPath("/api/cronx")).toBe(false);
    expect(isCronPath("/api/reports/subscriptions")).toBe(false);
    expect(isCronPath("/settings")).toBe(false);
    expect(isCronPath(null)).toBe(false);
    expect(isCustomerPublicPath("/api/cron/reports")).toBe(false);
    expect(isPublicPath("/api/cron/reports")).toBe(false);
    // CRM_AGENT sayfa olarak da erişemez.
    expect(canAccessPathFor("CRM_AGENT", "/api/cron/reports")).toBe(false);
  });
});
