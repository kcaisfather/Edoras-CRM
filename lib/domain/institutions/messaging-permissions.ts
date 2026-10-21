/**
 * Edoras mesajlaşma yetkileri (kurum ayrıntısı → "Mesajlaşma yetkileri" kartı). Yalnız kurumda `messaging` panel
 * modülü AÇIKKEN anlamlıdır. Edoras'taki karşılıkları (şema ve kural gerçeği edoras-admin'de):
 *
 *  - Kurum anahtarları → `institution_feature_settings` (institution_id, setting_key, value jsonb). Dört anahtar da
 *    varsayılan AÇIK; yalnız gerçek boolean değer sayılır (edoras-admin `lib/institution-feature-settings.ts` →
 *    `resolveFeatureSettings`). Bir sohbet türü kapanırsa o türdeki eski sohbetler silinmez, salt okunur kalır.
 *  - Öğretmen yetkisi `messaging.parents` (none / assigned / institution) → `institution_users.preset_id` (rol) +
 *    `permission_overrides`. Edoras paneliyle aynı sözleşme (`updateTeacherPermissions`): yalnız rolden SAPAN değer
 *    override'a yazılır, role eşit seçimde anahtar override'dan silinir; öbür yetkilerin override'ına dokunulmaz.
 */
import { z } from "zod";

/** Kartın sırası = Edoras panelindeki "Mesajlaşma" bölümünün sırası; bildirim anahtarı en sonda. */
export const MESSAGING_SETTING_KEYS = [
  "messaging_admin_teacher",
  "messaging_teacher_parent",
  "messaging_parent_inbox",
  "notify_message",
] as const;
export type MessagingSettingKey = (typeof MESSAGING_SETTING_KEYS)[number];

export const MESSAGING_CAPABILITY = "messaging.parents";

export const MESSAGING_SCOPES = ["none", "assigned", "institution"] as const;
export type MessagingScope = (typeof MESSAGING_SCOPES)[number];

/**
 * Rolü (preset) olmayan öğretmenin değeri: Edoras'ta `DEFAULT_PERMISSIONS` = "Branş Öğretmeni" (standart) rolü,
 * onda `messaging.parents` = assigned (edoras-admin `lib/permissions.ts`). Rol değişirse burası da değişir.
 */
export const SCOPE_WITHOUT_PRESET: MessagingScope = "assigned";

export interface FeatureSettingRow {
  setting_key: string;
  value: unknown;
}

export interface MessagingSettingState {
  key: MessagingSettingKey;
  enabled: boolean;
  /** Kurum bu anahtarı hiç yazmamış (ya da değer boolean değil) → varsayılan (açık) geçerli. */
  isDefault: boolean;
}

export interface TeacherMessagingRow {
  /** institution_users.id — yazma anahtarı. */
  institutionUserId: string;
  fullName: string;
  branch: string | null;
  /** Rol adı (`permission_presets.name`); rol yoksa null. */
  presetName: string | null;
  /** Rolün verdiği değer (override olmasaydı). */
  presetScope: MessagingScope;
  /** Etkin değer (override ∪ rol). */
  scope: MessagingScope;
  /** Etkin değer rolden sapıyor (override var). */
  overridden: boolean;
}

export interface MessagingPermissions {
  /** Kurumda `messaging` modülü açık mı; kapalıysa liste boş döner ve kart çizilmez. */
  moduleEnabled: boolean;
  settings: MessagingSettingState[];
  teachers: TeacherMessagingRow[];
}

export function isMessagingScope(value: unknown): value is MessagingScope {
  return typeof value === "string" && (MESSAGING_SCOPES as readonly string[]).includes(value);
}

/** Ham ayar satırları → dört anahtarın durumu (sabit sıra). */
export function resolveMessagingSettings(rows: readonly FeatureSettingRow[]): MessagingSettingState[] {
  const byKey = new Map(rows.map((row) => [row.setting_key, row.value]));
  return MESSAGING_SETTING_KEYS.map((key) => {
    const value = byKey.get(key);
    return typeof value === "boolean"
      ? { key, enabled: value, isDefault: false }
      : { key, enabled: true, isDefault: true };
  });
}

/**
 * Rolün `messaging.parents` değeri — Edoras `resolvePermissions(preset, null)` ile aynı: rolde geçerli değer varsa o;
 * rol dolu ama anahtar yoksa none; rol yok / boşsa varsayılan rol.
 */
export function presetScopeOf(presetPermissions: Record<string, unknown> | null | undefined): MessagingScope {
  const value = presetPermissions?.[MESSAGING_CAPABILITY];
  if (isMessagingScope(value)) return value;
  const hasPreset = presetPermissions != null && Object.keys(presetPermissions).length > 0;
  return hasPreset ? "none" : SCOPE_WITHOUT_PRESET;
}

/** Etkin değer: geçerli override rolü ezer. */
export function effectiveScope(
  presetPermissions: Record<string, unknown> | null | undefined,
  overrides: Record<string, unknown> | null | undefined
): MessagingScope {
  const override = overrides?.[MESSAGING_CAPABILITY];
  return isMessagingScope(override) ? override : presetScopeOf(presetPermissions);
}

/**
 * Yeni `permission_overrides`: istenen değer role eşitse anahtar silinir (rol değişirse öğretmen rolü izler), değilse
 * yazılır. Öbür yetkilerin anahtarları olduğu gibi kalır; girdi değiştirilmez.
 */
export function nextOverrides(
  overrides: Record<string, unknown> | null | undefined,
  presetScope: MessagingScope,
  desired: MessagingScope
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(overrides ?? {}) };
  if (desired === presetScope) delete next[MESSAGING_CAPABILITY];
  else next[MESSAGING_CAPABILITY] = desired;
  return next;
}

/** PATCH /api/institutions/{id}/messaging — tek kurum anahtarı. */
export const messagingSettingToggleSchema = z.object({
  key: z.enum(MESSAGING_SETTING_KEYS),
  enabled: z.boolean(),
});
export type MessagingSettingToggleInput = z.input<typeof messagingSettingToggleSchema>;

/** PATCH /api/institutions/{id}/messaging/teachers — tek öğretmenin `messaging.parents` değeri. */
export const teacherMessagingScopeSchema = z.object({
  institutionUserId: z.uuid(),
  scope: z.enum(MESSAGING_SCOPES),
});
export type TeacherMessagingScopeInput = z.input<typeof teacherMessagingScopeSchema>;
