import { describe, expect, it } from "vitest";
import {
  effectiveScope,
  messagingSettingToggleSchema,
  nextOverrides,
  presetScopeOf,
  resolveMessagingSettings,
  teacherMessagingScopeSchema,
} from "./messaging-permissions";

const STANDART = { "attendance.take": "assigned", "messaging.parents": "assigned" };

describe("resolveMessagingSettings", () => {
  it("satır yoksa dört anahtar da varsayılan açık, sabit sırada", () => {
    expect(resolveMessagingSettings([])).toEqual([
      { key: "messaging_admin_teacher", enabled: true, isDefault: true },
      { key: "messaging_teacher_parent", enabled: true, isDefault: true },
      { key: "messaging_parent_inbox", enabled: true, isDefault: true },
      { key: "notify_message", enabled: true, isDefault: true },
    ]);
  });

  it("yalnız gerçek boolean sayılır (Edoras resolveFeatureSettings ile aynı)", () => {
    const list = resolveMessagingSettings([
      { setting_key: "messaging_teacher_parent", value: false },
      { setting_key: "messaging_parent_inbox", value: "false" },
      { setting_key: "notify_message", value: null },
      { setting_key: "notify_attendance_absence", value: false },
    ]);
    expect(list.find((s) => s.key === "messaging_teacher_parent")).toEqual({
      key: "messaging_teacher_parent",
      enabled: false,
      isDefault: false,
    });
    expect(list.find((s) => s.key === "messaging_parent_inbox")).toMatchObject({ enabled: true, isDefault: true });
    expect(list.find((s) => s.key === "notify_message")).toMatchObject({ enabled: true, isDefault: true });
    expect(list).toHaveLength(4);
  });
});

describe("presetScopeOf / effectiveScope", () => {
  it("rolün değeri", () => {
    expect(presetScopeOf(STANDART)).toBe("assigned");
    expect(presetScopeOf({ "messaging.parents": "institution" })).toBe("institution");
  });

  it("rol dolu ama anahtar yok → none; rol yok / boş → Branş Öğretmeni varsayılanı (assigned)", () => {
    expect(presetScopeOf({ "attendance.take": "assigned" })).toBe("none");
    expect(presetScopeOf(null)).toBe("assigned");
    expect(presetScopeOf({})).toBe("assigned");
  });

  it("geçersiz rol değeri yok sayılır", () => {
    expect(presetScopeOf({ "attendance.take": "assigned", "messaging.parents": "all" })).toBe("none");
  });

  it("geçerli override rolü ezer, geçersiz override yok sayılır", () => {
    expect(effectiveScope(STANDART, { "messaging.parents": "none" })).toBe("none");
    expect(effectiveScope(STANDART, { "messaging.parents": "everyone" })).toBe("assigned");
    expect(effectiveScope(null, { "messaging.parents": "institution" })).toBe("institution");
  });
});

describe("nextOverrides", () => {
  it("rolden sapan değer yazılır, öbür yetkiler korunur", () => {
    const before = { "students.view": "institution" };
    const next = nextOverrides(before, "assigned", "none");
    expect(next).toEqual({ "students.view": "institution", "messaging.parents": "none" });
    expect(before).toEqual({ "students.view": "institution" });
  });

  it("role eşit seçim özel ayarı siler (öğretmen yeniden rolü izler)", () => {
    expect(nextOverrides({ "messaging.parents": "none", "students.view": "institution" }, "assigned", "assigned")).toEqual({
      "students.view": "institution",
    });
  });

  it("null override'dan başlar", () => {
    expect(nextOverrides(null, "none", "institution")).toEqual({ "messaging.parents": "institution" });
    expect(nextOverrides(null, "assigned", "assigned")).toEqual({});
  });
});

describe("şemalar", () => {
  it("yalnız mesajlaşma anahtarları kabul edilir", () => {
    expect(messagingSettingToggleSchema.safeParse({ key: "messaging_parent_inbox", enabled: false }).success).toBe(true);
    expect(messagingSettingToggleSchema.safeParse({ key: "notify_attendance_absence", enabled: false }).success).toBe(false);
    expect(messagingSettingToggleSchema.safeParse({ key: "notify_message", enabled: "true" }).success).toBe(false);
  });

  it("öğretmen kapsamı: uuid + üç değerden biri", () => {
    const id = "2ea9f244-da4f-4879-91c6-1181530cbbd5";
    expect(teacherMessagingScopeSchema.safeParse({ institutionUserId: id, scope: "institution" }).success).toBe(true);
    expect(teacherMessagingScopeSchema.safeParse({ institutionUserId: id, scope: "all" }).success).toBe(false);
    expect(teacherMessagingScopeSchema.safeParse({ institutionUserId: "x", scope: "none" }).success).toBe(false);
  });
});
