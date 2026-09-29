/**
 * Mükerrer ÖNİZLEMESİ ve çözüm planı (DeepSport lib/import/duplicates.ts). Tarayıcıda çalışır; kullanıcıya neyin
 * çakıştığını gösterir ve dosya satırlarını birleştirir / atlar. Asıl karar sunucudadır: sunucu aynı kontrolü
 * kendi okuduğu verilerle yeniden yapar ve mükerreri hiçbir koşulda eklemez (lib/import/bulk.ts →
 * screenImportItems). Bu yüzden DeepSport'taki "Yine de ekle" seçeneği yok: yalnız Atla ve Birleştir.
 *
 * Kayıtlar normalize telefon (E.164) ya da e-posta paylaşıyorsa aynı gruba düşer (birleşim-bul); grup, (a) dosya
 * içi tekrar ve/veya (b) mevcut kayıtlarla (CRM adayı, kurum yetkilisi, hedef soğuk liste) çakışma içerir.
 */
import type { ImportRecord } from "./records";

/** crm: CRM adayı · institution: Edoras kurumunun CRM kaydındaki yetkili · coldList: hedef listedeki kişi. */
export type ExistingSource = "crm" | "institution" | "coldList";

export interface ExistingContact {
  source: ExistingSource;
  id: string;
  name: string;
  organization?: string | null;
  /** E.164 */
  phone: string | null;
  /** Normalize e-posta */
  email: string | null;
  /** Soğuk liste adı / CRM statüsü gibi kısa bağlam. */
  context?: string | null;
}

export interface DuplicateGroup {
  key: string;
  /** Grubu bağlayan birincil değer türü: telefon önceliklidir. */
  kind: "phone" | "email";
  value: string;
  /** Dosyadaki kayıtların id'leri (satır sırasıyla). */
  recordIds: string[];
  existing: ExistingContact[];
}

export type Resolution = "skip" | "merge";
export const RESOLUTIONS: readonly Resolution[] = ["skip", "merge"];

function indexBy<T>(items: readonly T[], getKey: (t: T) => string | null): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = getKey(item);
    if (!k) continue;
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}

/** Birleşim-bul: telefon ya da e-posta paylaşan dosya kayıtları aynı bileşende (kayıt indeksleri). */
function fileComponents(records: readonly ImportRecord[]): number[][] {
  const parent = records.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };
  const firstByPhone = new Map<string, number>();
  const firstByEmail = new Map<string, number>();
  records.forEach((r, i) => {
    if (r.phone) {
      const j = firstByPhone.get(r.phone);
      if (j == null) firstByPhone.set(r.phone, i);
      else union(i, j);
    }
    if (r.email) {
      const j = firstByEmail.get(r.email);
      if (j == null) firstByEmail.set(r.email, i);
      else union(i, j);
    }
  });
  const components = new Map<number, number[]>();
  records.forEach((_, i) => {
    const root = find(i);
    const list = components.get(root);
    if (list) list.push(i);
    else components.set(root, [i]);
  });
  return [...components.values()];
}

export function findDuplicateGroups(records: readonly ImportRecord[], existing: readonly ExistingContact[]): DuplicateGroup[] {
  const existingByPhone = indexBy(existing, (e) => e.phone);
  const existingByEmail = indexBy(existing, (e) => e.email);

  const groups: DuplicateGroup[] = [];
  for (const members of fileComponents(records)) {
    const recs = members.map((i) => records[i]);
    const phones = [...new Set(recs.map((r) => r.phone).filter((p): p is string => !!p))];
    const emails = [...new Set(recs.map((r) => r.email).filter((e): e is string => !!e))];

    const seen = new Set<string>();
    const matches: ExistingContact[] = [];
    const collect = (values: string[], index: Map<string, ExistingContact[]>): string | null => {
      let matched: string | null = null;
      for (const v of values) {
        for (const e of index.get(v) ?? []) {
          matched ??= v;
          const k = `${e.source}:${e.id}`;
          if (!seen.has(k)) {
            seen.add(k);
            matches.push(e);
          }
        }
      }
      return matched;
    };
    const matchedByPhone = collect(phones, existingByPhone);
    const matchedByEmail = collect(emails, existingByEmail);
    if (recs.length < 2 && matches.length === 0) continue;

    // Dosya içinde en az iki kaydın paylaştığı telefon var mı?
    const sharedPhone = phones.find((p) => recs.filter((r) => r.phone === p).length > 1) ?? null;
    const sharedEmail = emails.find((e) => recs.filter((r) => r.email === e).length > 1) ?? null;
    const phoneValue = sharedPhone ?? matchedByPhone;
    const kind: DuplicateGroup["kind"] = phoneValue ? "phone" : "email";
    const value = phoneValue ?? sharedEmail ?? matchedByEmail ?? "";
    groups.push({ key: `${kind}:${value}:${recs[0].id}`, kind, value, recordIds: recs.map((r) => r.id), existing: matches });
  }
  const order = new Map(records.map((r, i) => [r.id, i]));
  return groups.sort((a, b) => (order.get(a.recordIds[0]) ?? 0) - (order.get(b.recordIds[0]) ?? 0));
}

/** Grup kayıtlarını tek kayda indirger: her alanda ilk dolu değer, notlar birleştirilir. */
export function mergeRecords(recs: readonly ImportRecord[]): ImportRecord {
  const first = recs[0];
  const pick = <K extends keyof ImportRecord>(k: K): ImportRecord[K] =>
    (recs.find((r) => r[k] !== "" && r[k] != null)?.[k] ?? first[k]) as ImportRecord[K];
  const notes = [...new Set(recs.map((r) => r.note).filter(Boolean))];
  // Ad ve soyad aynı kayıttan gelsin (farklı kişilerin adı karışmasın).
  const named = recs.find((r) => r.firstName || r.lastName) ?? first;
  const phoneFrom = recs.find((r) => r.phone) ?? recs.find((r) => r.phoneRaw) ?? first;
  const emailFrom = recs.find((r) => r.email) ?? recs.find((r) => r.emailRaw) ?? first;
  return {
    ...first,
    firstName: named.firstName,
    lastName: named.lastName,
    organization: pick("organization"),
    phoneRaw: phoneFrom.phoneRaw,
    phone: phoneFrom.phone,
    emailRaw: emailFrom.emailRaw,
    email: emailFrom.email,
    city: pick("city"),
    district: pick("district"),
    branch: pick("branch"),
    note: notes.join(" | "),
  };
}

export interface ImportPlan {
  /** Sunucuya gönderilecek kayıtlar (birleştirilmiş dosya grupları dahil). */
  creates: ImportRecord[];
  /**
   * Mevcut bir kayıtla birleştirilecekler — yeni kayıt açılmaz. Yalnız hedef soğuk listedeki kişinin boş alanları
   * tamamlanır; CRM adayı ve kurum kaydına dokunulmaz.
   */
  mergeIntoExisting: { record: ImportRecord; existing: ExistingContact }[];
  stats: { create: number; merged: number; skipped: number };
}

/**
 * Çözüm planı:
 *  - merge: mevcut kayıt varsa dosya satırları ona birleşir (yeni kayıt yok); yoksa dosya satırları tek kayda iner.
 *  - skip: mevcut kayıt varsa gruptaki tüm dosya satırları atlanır; yoksa ilk satır kalır, tekrarlar atlanır.
 */
export function planImport(
  records: readonly ImportRecord[],
  groups: readonly DuplicateGroup[],
  resolutions: Readonly<Record<string, Resolution>>,
  fallback: Resolution = "skip"
): ImportPlan {
  const byId = new Map(records.map((r) => [r.id, r]));
  const grouped = new Map<string, DuplicateGroup>();
  for (const g of groups) for (const id of g.recordIds) grouped.set(id, g);

  const creates: ImportRecord[] = [];
  const mergeIntoExisting: ImportPlan["mergeIntoExisting"] = [];
  let merged = 0;
  let skipped = 0;
  const handled = new Set<string>();

  for (const r of records) {
    const g = grouped.get(r.id);
    if (!g) {
      creates.push(r);
      continue;
    }
    if (handled.has(g.key)) continue;
    handled.add(g.key);
    const recs = g.recordIds.map((id) => byId.get(id)).filter((x): x is ImportRecord => !!x);
    const resolution = resolutions[g.key] ?? fallback;
    const hasExisting = g.existing.length > 0;

    if (resolution === "merge") {
      const one = mergeRecords(recs);
      if (hasExisting) {
        mergeIntoExisting.push({ record: one, existing: g.existing[0] });
        merged += recs.length;
      } else {
        creates.push(one);
        merged += recs.length - 1;
      }
    } else if (hasExisting) {
      skipped += recs.length;
    } else {
      creates.push(recs[0]);
      skipped += recs.length - 1;
    }
  }

  return { creates, mergeIntoExisting, stats: { create: creates.length, merged, skipped } };
}
