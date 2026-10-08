/**
 * Edoras panel modülleri (kurum bazında aç / kapa — ör. Muhasebe). Sözleşme edoras-admin migration 300'de:
 * `panel_modules` katalog (key, label, description, default_enabled, sort_order) + `institution_panel_modules`
 * kurum durumu (institution_id, module_key, enabled, updated_at, updated_by). CRM katalogu okur, kurum satırını
 * upsert eder; Edoras şemasına dokunmaz. Kurum satırı yoksa katalogdaki `default_enabled` geçerlidir — Edoras
 * tarafı (`utils/supabase/panel-modules.ts`) da aynı kuralla okur.
 */
import { z } from "zod";

export interface PanelModuleCatalogRow {
  key: string;
  label: string;
  description: string | null;
  default_enabled: boolean | null;
  sort_order: number | null;
}

export interface InstitutionPanelModuleRow {
  module_key: string;
  enabled: boolean | null;
  updated_at: string | null;
  updated_by: string | null;
}

export interface PanelModuleState {
  key: string;
  label: string;
  description: string | null;
  enabled: boolean;
  /** Kurum satırı yok → katalog varsayılanı geçerli. */
  isDefault: boolean;
  defaultEnabled: boolean;
  updatedAt: string | null;
}

/** Katalog sırası (`sort_order`, sonra ad); katalogda olmayan kurum satırı (silinmiş modül) gösterilmez. */
export function mergePanelModules(
  catalog: readonly PanelModuleCatalogRow[],
  rows: readonly InstitutionPanelModuleRow[]
): PanelModuleState[] {
  const byKey = new Map(rows.map((row) => [row.module_key, row]));
  return [...catalog]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.label.localeCompare(b.label, "tr"))
    .map((module) => {
      const defaultEnabled = module.default_enabled === true;
      const row = byKey.get(module.key);
      return {
        key: module.key,
        label: module.label,
        description: module.description,
        // NULL `enabled` Edoras'ta da kapalı sayılmaz → varsayılana düşer.
        enabled: row && row.enabled !== null ? row.enabled : defaultEnabled,
        isDefault: !row || row.enabled === null,
        defaultEnabled,
        updatedAt: row?.updated_at ?? null,
      };
    });
}

/** PATCH /api/institutions/{id}/modules — tek modülün durumu. */
export const panelModuleToggleSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9_]+$/, "Geçersiz modül anahtarı."),
  enabled: z.boolean(),
});
export type PanelModuleToggleInput = z.input<typeof panelModuleToggleSchema>;
