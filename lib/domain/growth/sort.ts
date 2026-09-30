/**
 * Müşteri tablolarının sütun sıralaması (DeepSport growth/sort.ts): alan → değer eşlemeleri (`sortRows` ile).
 * Durum URL'de `?sort=alan&dir=asc|desc`. Boş değerler (bitiş yok, hiç etkinlik yok) yönden bağımsız hep sonda.
 */
import type { SortState, SortValue } from "@/lib/utils/sort";
import { balanceOf } from "./economics";
import { renewalDaysLeft, renewalEndsOn, type RenewalRow } from "./renewals";
import { isUsing, totalActivity } from "./usage";
import type { GrowthCustomer } from "./types";
import type { TopInstitutionRow } from "./top";

export type Accessors<T, K extends string> = Record<K, (row: T) => SortValue>;

/** Yalnız finansal yetkiyle görünen (ve sıralanabilen) sütunlar; sıralama da tutar bilgisi sızdırır. */
export const FINANCIAL_SORT_KEYS = ["balance"] as const;

/** Finansal yetki yoksa finansal sütuna göre sıralama yok sayılır (varsayılan sıra). */
export function guardFinancialSort<K extends string>(sort: SortState<K> | null, canSeeFinancials: boolean): SortState<K> | null {
  if (!sort || canSeeFinancials) return sort;
  return (FINANCIAL_SORT_KEYS as readonly string[]).includes(sort.key) ? null : sort;
}

export const CUSTOMER_SORT_KEYS = [
  "customer",
  "status",
  "endsOn",
  "daysLeft",
  "students",
  "teachers",
  "activeTeachers",
  "activity",
  "lastActivity",
  "usage",
  "balance",
] as const;
export type CustomerSortKey = (typeof CUSTOMER_SORT_KEYS)[number];

/** GrowthCustomer alan → sıralama değeri; kullanım boolean (artan: Kullanmıyor önce). `statusLabel` verilirse etikete göre. */
export function customerSortAccessors(opts: { now?: Date; statusLabel?: (c: GrowthCustomer) => string } = {}): Accessors<GrowthCustomer, CustomerSortKey> {
  const now = opts.now ?? new Date();
  return {
    customer: (c) => c.name,
    status: (c) => (opts.statusLabel ? opts.statusLabel(c) : c.state),
    endsOn: (c) => renewalEndsOn(c),
    daysLeft: (c) => renewalDaysLeft(c, now),
    students: (c) => c.usage?.students,
    teachers: (c) => c.usage?.teachers,
    activeTeachers: (c) => c.usage?.activeTeachers,
    activity: (c) => (c.usage ? totalActivity(c.usage.counts) : null),
    lastActivity: (c) => c.usage?.lastActivityOn ?? null,
    usage: (c) => (c.usage ? isUsing(c.usage, now) : null),
    balance: (c) => balanceOf(c) || null,
  };
}

export const RENEWAL_SORT_KEYS = ["customer", "status", "endsOn", "daysLeft", "lastActivity"] as const;
export type RenewalSortKey = (typeof RENEWAL_SORT_KEYS)[number];

export function renewalSortAccessors(now = new Date()): Accessors<RenewalRow, RenewalSortKey> {
  const base = customerSortAccessors({ now });
  return {
    customer: (r) => base.customer(r.customer),
    status: (r) => r.bucket,
    endsOn: (r) => r.endsOn,
    daysLeft: (r) => r.daysLeft,
    lastActivity: (r) => base.lastActivity(r.customer),
  };
}

export const TOP_SORT_KEYS = ["customer", "activity", "sources", "lastActivity", "students"] as const;
export type TopSortKey = (typeof TOP_SORT_KEYS)[number];

export function topSortAccessors(): Accessors<TopInstitutionRow, TopSortKey> {
  return {
    customer: (r) => r.customer.name,
    activity: (r) => r.activity,
    sources: (r) => r.sources,
    lastActivity: (r) => r.customer.usage?.lastActivityOn ?? null,
    students: (r) => r.customer.usage?.students,
  };
}
