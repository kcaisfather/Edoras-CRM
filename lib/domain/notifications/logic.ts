/**
 * Bildirim zili — tipler ve "görüldü" mantığı (saf; testler logic.test.ts).
 * Bildirimler veritabanında SAKLANMAZ: sunucu mevcut verilerden her istekte türetir (lib/server/notifications.ts), metin
 * üretmez (yalnız tür + parametre; metin messages/features/shell.tr.json). "Görüldü" bilgisi tarayıcıdadır: her bildirimin
 * bir `signature`'ı vardır (içeriği değişince değişir); görülmüş imza kayıtlıysa bildirim okunmuş sayılır, değişince
 * (yeni gecikmiş görev, yeni yanıt…) yeniden okunmamış olur.
 */

export const NOTIFICATION_KINDS = ["TASKS_DUE", "APPOINTMENT", "SURVEY_RESPONSES", "LICENSE_ENDING", "TICKETS_OPEN"] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export interface NotificationItem {
  /** Kararlı anahtar (ör. "tasks", "appt:<id>", "survey", "license:<kurum>"). */
  id: string;
  kind: NotificationKind;
  /** İçerik değişince değişir; görüldü kaydı bununla karşılaştırılır. */
  signature: string;
  /** Tıklayınca gidilecek panel yolu. */
  href: string;
  /** TASKS_DUE: bugün vadesi gelen + gecikmiş açık görev; SURVEY_RESPONSES: yeni yanıt sayısı; TICKETS_OPEN: atanmamış + çağırana atanmış açık talep sayısı. */
  count?: number;
  /** APPOINTMENT: aday adı; LICENSE_ENDING: kurum adı. */
  name?: string | null;
  /** APPOINTMENT: başlangıç (epoch ms). */
  at?: number;
  /** APPOINTMENT: saati geçmiş. */
  overdue?: boolean;
  /** LICENSE_ENDING: kalan gün ve demo mu. */
  daysLeft?: number;
  demo?: boolean;
}

/** GET /api/crm/notifications */
export interface NotificationsDto {
  items: NotificationItem[];
  generatedAt: number;
}

/** Görülmüş imzalar: bildirim anahtarı → imza. */
export type SeenMap = Readonly<Record<string, string>>;

export const isUnread = (item: Pick<NotificationItem, "id" | "signature">, seen: SeenMap): boolean => seen[item.id] !== item.signature;

export function unreadCount(items: readonly NotificationItem[], seen: SeenMap): number {
  return items.filter((i) => isUnread(i, seen)).length;
}

/** Tümünü görüldü işaretler; artık listede olmayan eski kayıtlar atılır (depolama şişmesin). */
export function markAllSeen(items: readonly NotificationItem[]): Record<string, string> {
  return Object.fromEntries(items.map((i) => [i.id, i.signature]));
}

/** Depolamadan okunan ham değeri güvenle SeenMap'e çevirir (bozuk / eski biçim → boş). */
export function parseSeen(raw: unknown): SeenMap {
  if (typeof raw !== "string") return {};
  try {
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    return Object.fromEntries(Object.entries(v).filter((e): e is [string, string] => typeof e[1] === "string"));
  } catch {
    return {};
  }
}

/** Bildirim sırası: önce randevu (zamana duyarlı), görev, destek talebi, lisans, anket. Aynı türde kendi sırası korunur. */
const ORDER: Record<NotificationKind, number> = { APPOINTMENT: 0, TASKS_DUE: 1, TICKETS_OPEN: 2, LICENSE_ENDING: 3, SURVEY_RESPONSES: 4 };

export function sortNotifications<T extends Pick<NotificationItem, "kind">>(items: readonly T[]): T[] {
  return items.map((item, i) => ({ item, i })).sort((a, b) => ORDER[a.item.kind] - ORDER[b.item.kind] || a.i - b.i).map((x) => x.item);
}
