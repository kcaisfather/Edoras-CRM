import "server-only";

/**
 * PostgREST sorgu zinciri için dar arayüz. supabase-js'in genel tipleri, koşullu süzgeç eklenen ve birden çok kez
 * kurulan sorgularda "type instantiation is excessively deep" hatası verir; liste uçları (fatura, ödeme geçmişi) bu
 * arayüzle yazılır. Yalnız kullanılan yöntemler; sonuç satırları çağıran tarafından tiplenir.
 */
export interface PgResult {
  data: unknown[] | null;
  error: { code?: string; message?: string } | null;
  count: number | null;
}

export interface PgChain extends PromiseLike<PgResult> {
  eq(column: string, value: string): PgChain;
  gte(column: string, value: string): PgChain;
  lte(column: string, value: string): PgChain;
  lt(column: string, value: string): PgChain;
  ilike(column: string, pattern: string): PgChain;
  order(column: string, options?: { ascending?: boolean }): PgChain;
  range(from: number, to: number): PgChain;
}

export const pgChain = (query: unknown): PgChain => query as PgChain;
