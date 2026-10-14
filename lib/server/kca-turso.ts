/**
 * KCA Panel'in Turso veritabanına HTTP istemcisi (Hrana v2 `/v2/pipeline`; npm paketi yok — KCA Panel'in lib/db.js'i ile
 * aynı protokol). Ortam değişkeni okumaz, `fetch` dışarıdan verilir: testler gerçek ağa çıkmadan bellek içi SQLite'a
 * bağlanır (kca-test-support.ts). Sunucu bağlantısı: lib/server/kca.ts.
 *
 * Hata hâlinde yalnız kısa kod (`turso:<http durumu>` / `turso:sql`) taşınır: SQL hata metni ve yanıt gövdesi satır
 * değeri taşıyabileceği için istemciye ve loga gitmez.
 */

export type KcaValue = string | number | null;
export type KcaArg = KcaValue | boolean | undefined;
export type KcaRow = Record<string, KcaValue>;

export interface KcaStatement {
  sql: string;
  args?: KcaArg[];
}

export interface KcaResult {
  rows: KcaRow[];
  rowsAffected: number;
}

/** KCA Panel veritabanı: tek ifade ya da sıralı ifadeler (tek istekte; işlem/transaction değildir). */
export interface KcaDb {
  execute(sql: string, args?: KcaArg[]): Promise<KcaResult>;
  batch(statements: KcaStatement[]): Promise<KcaResult[]>;
}

export class KcaDbError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
    this.name = "KcaDbError";
  }
}

const REQUEST_TIMEOUT_MS = 15_000;

type HranaValue =
  | { type: "null" }
  | { type: "integer"; value: string }
  | { type: "float"; value: number }
  | { type: "text"; value: string }
  | { type: "blob"; base64: string };

function toArg(v: KcaArg): HranaValue {
  if (v === null || v === undefined) return { type: "null" };
  if (typeof v === "boolean") return { type: "integer", value: v ? "1" : "0" };
  if (typeof v === "number") return Number.isInteger(v) ? { type: "integer", value: String(v) } : { type: "float", value: v };
  return { type: "text", value: String(v) };
}

function fromValue(v: HranaValue | undefined): KcaValue {
  if (!v || v.type === "null") return null;
  if (v.type === "integer" || v.type === "float") return Number(v.value);
  if (v.type === "blob") return v.base64;
  return v.value;
}

interface HranaResponse {
  results?: Array<
    | { type: "ok"; response: { type: string; result?: { cols: { name: string }[]; rows: HranaValue[][]; affected_row_count: number } } }
    | { type: "error"; error?: { message?: string } }
  >;
}

/** `libsql://ad.turso.io` → `https://ad.turso.io/v2/pipeline`. */
export function pipelineEndpoint(url: string): string {
  return `${url.trim().replace(/^libsql:\/\//, "https://").replace(/\/+$/, "")}/v2/pipeline`;
}

export function createTursoHttpDb(config: { url: string; authToken?: string | null; fetch: typeof fetch }): KcaDb {
  const endpoint = pipelineEndpoint(config.url);

  async function pipeline(statements: KcaStatement[]): Promise<KcaResult[]> {
    const requests = [
      ...statements.map((s) => ({ type: "execute", stmt: { sql: s.sql, args: (s.args ?? []).map(toArg) } })),
      { type: "close" },
    ];
    let res: Response;
    try {
      res = await config.fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.authToken ? { Authorization: `Bearer ${config.authToken}` } : {}),
        },
        body: JSON.stringify({ requests }),
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new KcaDbError("turso:network");
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      throw new KcaDbError(`turso:${res.status}`);
    }
    const body = (await res.json().catch(() => null)) as HranaResponse | null;
    if (!body || !Array.isArray(body.results)) throw new KcaDbError("turso:response");
    return statements.map((_, i) => {
      const r = body.results?.[i];
      if (!r || r.type !== "ok" || !r.response.result) throw new KcaDbError("turso:sql");
      const result = r.response.result;
      const cols = result.cols.map((c) => c.name);
      const rows = result.rows.map((row) => {
        const o: KcaRow = {};
        row.forEach((v, j) => {
          o[cols[j]] = fromValue(v);
        });
        return o;
      });
      return { rows, rowsAffected: result.affected_row_count };
    });
  }

  return {
    async execute(sql, args) {
      return (await pipeline([{ sql, args }]))[0];
    },
    async batch(statements) {
      return statements.length ? pipeline(statements) : [];
    },
  };
}
