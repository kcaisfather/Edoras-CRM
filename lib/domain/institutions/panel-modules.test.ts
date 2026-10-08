import { describe, expect, it } from "vitest";
import { mergePanelModules, panelModuleToggleSchema, type PanelModuleCatalogRow } from "./panel-modules";

const ACCOUNTING: PanelModuleCatalogRow = {
  key: "accounting",
  label: "Muhasebe",
  description: "Taksit planı, tahsilat, makbuz",
  default_enabled: false,
  sort_order: 100,
};

describe("mergePanelModules", () => {
  it("kurum satırı yoksa katalog varsayılanı geçerli", () => {
    const [m] = mergePanelModules([ACCOUNTING], []);
    expect(m).toMatchObject({ key: "accounting", enabled: false, isDefault: true, defaultEnabled: false, updatedAt: null });
  });

  it("kurum satırı varsayılanı ezer", () => {
    const [m] = mergePanelModules(
      [ACCOUNTING],
      [{ module_key: "accounting", enabled: true, updated_at: "2026-10-08T12:44:56Z", updated_by: "crm:Ayşe" }]
    );
    expect(m).toMatchObject({ enabled: true, isDefault: false, updatedAt: "2026-10-08T12:44:56Z" });
  });

  it("açık varsayılanlı modül kurumda kapatılabilir", () => {
    const [m] = mergePanelModules(
      [{ ...ACCOUNTING, default_enabled: true }],
      [{ module_key: "accounting", enabled: false, updated_at: null, updated_by: null }]
    );
    expect(m.enabled).toBe(false);
    expect(m.isDefault).toBe(false);
  });

  it("katalog sırası korunur, katalogda olmayan satır gösterilmez", () => {
    const list = mergePanelModules(
      [ACCOUNTING, { key: "crm", label: "Ön kayıt", description: null, default_enabled: null, sort_order: 10 }],
      [{ module_key: "silinmis", enabled: true, updated_at: null, updated_by: null }]
    );
    expect(list.map((m) => m.key)).toEqual(["crm", "accounting"]);
    expect(list[0].enabled).toBe(false);
  });
});

describe("panelModuleToggleSchema", () => {
  it("geçerli anahtar ve boolean", () => {
    expect(panelModuleToggleSchema.parse({ key: "accounting", enabled: true })).toEqual({ key: "accounting", enabled: true });
  });

  it("anahtar biçimi ve boolean zorunlu", () => {
    expect(panelModuleToggleSchema.safeParse({ key: "Muhasebe!", enabled: true }).success).toBe(false);
    expect(panelModuleToggleSchema.safeParse({ key: "accounting", enabled: "true" }).success).toBe(false);
  });
});
