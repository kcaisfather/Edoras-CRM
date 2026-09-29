/**
 * Tablo sıralaması (tıklanabilir sütun başlıkları): durum URL'de `?sort=alan&dir=asc|desc`.
 * Döngü: kapalı → artan → azalan → kapalı. Boş değerler (null/undefined/"") yönden bağımsız hep sonda.
 */

export type SortDir = "asc" | "desc";
export interface SortState<K extends string = string> {
  key: K;
  dir: SortDir;
}

export type SortValue = string | number | boolean | null | undefined;

/** Başlığa tıklanınca sonraki durum. */
export function nextSort<K extends string>(current: SortState<K> | null, key: K): SortState<K> | null {
  if (!current || current.key !== key) return { key, dir: "asc" };
  if (current.dir === "asc") return { key, dir: "desc" };
  return null;
}

/** URL parametrelerinden durum; bilinmeyen alan/yön → null. */
export function parseSort<K extends string>(
  sort: string | null | undefined,
  dir: string | null | undefined,
  keys: readonly K[]
): SortState<K> | null {
  if (!sort || !(keys as readonly string[]).includes(sort)) return null;
  return { key: sort as K, dir: dir === "desc" ? "desc" : "asc" };
}

const isEmpty = (v: SortValue) => v == null || v === "" || (typeof v === "number" && Number.isNaN(v));

/** İki değeri karşılaştırır: metin tr yerel ayarıyla (büyük/küçük harf duyarsız), sayı/boolean sayısal. */
export function compareValues(a: SortValue, b: SortValue, dir: SortDir = "asc", locale = "tr"): number {
  const ea = isEmpty(a);
  const eb = isEmpty(b);
  if (ea || eb) return ea && eb ? 0 : ea ? 1 : -1; // boşlar hep sonda
  let r: number;
  if (typeof a === "string" || typeof b === "string") {
    r = String(a).localeCompare(String(b), locale, { sensitivity: "base", numeric: true });
  } else {
    r = Number(a) - Number(b);
  }
  return dir === "asc" ? r : -r;
}

/**
 * Satırları sıralar (kararlı; kopya döner). `accessors` alan → değer. Durum yoksa sıra korunur.
 */
export function sortRows<T, K extends string>(
  rows: readonly T[],
  state: SortState<K> | null,
  accessors: Record<K, (row: T) => SortValue>,
  locale = "tr"
): T[] {
  if (!state) return [...rows];
  const get = accessors[state.key];
  if (!get) return [...rows];
  return rows
    .map((row, i) => ({ row, i, v: get(row) }))
    .sort((x, y) => compareValues(x.v, y.v, state.dir, locale) || x.i - y.i)
    .map((x) => x.row);
}
