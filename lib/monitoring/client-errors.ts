/**
 * G37 — Panel istemci hata kaydı ve istek hacmi gözlemi (dış servis olmadan MVP).
 *
 * - Hatalar konsola yazılır ve bu sekmenin sessionStorage'ında son MAX_ERRORS kayıt tutulur.
 * - KVKK: mesaj ve stack'teki e-posta, telefon ve token benzeri değerler maskelenir.
 * - İstek hacmi: PerformanceObserver ile /api/ çağrıları sayfa başına sayılır (istek başlığına
 *   dokunulmaz, API katmanı değişmez).
 * Kalıcı, ekipçe görülen izleme için Sentry benzeri bir servis (DSN) gerekir — backend/altyapı isteği.
 */

export type ClientErrorSource = "boundary" | "global-boundary" | "window" | "unhandledrejection";

export interface ClientErrorEntry {
  at: number;
  source: ClientErrorSource;
  name: string;
  message: string;
  digest?: string;
  path: string;
  stack?: string;
}

export interface RequestStat {
  path: string;
  count: number;
  totalMs: number;
  maxMs: number;
  failed: number;
}

const ERRORS_KEY = "ecrm.clientErrors";
const REQUESTS_KEY = "ecrm.requestStats";
const CHANGE_EVENT = "ecrm:client-errors-change";
export const MAX_ERRORS = 30;

/** E-posta, telefon, JWT/uzun token değerlerini maskeler. */
export function maskPii(text: string): string {
  return text
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[token]")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]")
    .replace(/\+?\d[\d\s().-]{8,}\d/g, "[phone]")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[id]");
}

function toEntry(error: unknown, source: ClientErrorSource, path: string): ClientErrorEntry {
  const err = error instanceof Error ? error : null;
  const raw = err ? err.message : typeof error === "string" ? error : safeString(error);
  const digest = (error as { digest?: unknown } | null)?.digest;
  return {
    at: Date.now(),
    source,
    name: err?.name ?? "Error",
    message: maskPii(raw || "Unknown error").slice(0, 500),
    ...(typeof digest === "string" ? { digest } : {}),
    path,
    ...(err?.stack ? { stack: maskPii(err.stack.split("\n").slice(0, 6).join("\n")) } : {}),
  };
}

function safeString(v: unknown): string {
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return String(v);
  }
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* depolama kapalı / dolu */
  }
  try {
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    /* no-op */
  }
}

/** Yeni kaydı başa ekler; aynı mesaj 3 sn içinde tekrarlanırsa yutulur (sel koruması). */
export function appendEntry(list: ClientErrorEntry[], entry: ClientErrorEntry, max = MAX_ERRORS): ClientErrorEntry[] {
  const last = list[0];
  if (last && last.message === entry.message && last.source === entry.source && entry.at - last.at < 3000) {
    return list;
  }
  return [entry, ...list].slice(0, max);
}

/** Hata yakalayıcıların tek giriş noktası. */
export function reportClientError(error: unknown, source: ClientErrorSource): void {
  if (typeof window === "undefined") return;
  console.error(`[client-error:${source}]`, error);
  const entry = toEntry(error, source, window.location.pathname);
  writeJson(ERRORS_KEY, appendEntry(readJson<ClientErrorEntry[]>(ERRORS_KEY, []), entry));
}

export function readClientErrors(): ClientErrorEntry[] {
  if (typeof window === "undefined") return [];
  const list = readJson<unknown>(ERRORS_KEY, []);
  return Array.isArray(list) ? (list as ClientErrorEntry[]) : [];
}

export function readRequestStats(): RequestStat[] {
  if (typeof window === "undefined") return [];
  const map = readJson<Record<string, Omit<RequestStat, "path">>>(REQUESTS_KEY, {});
  return Object.entries(map)
    .map(([path, s]) => ({ path, ...s }))
    .sort((a, b) => b.count - a.count);
}

export function clearClientDiagnostics(): void {
  try {
    window.sessionStorage.removeItem(ERRORS_KEY);
    window.sessionStorage.removeItem(REQUESTS_KEY);
  } catch {
    /* no-op */
  }
  writeJson(ERRORS_KEY, []);
}

export function subscribeClientDiagnostics(cb: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, cb);
  return () => window.removeEventListener(CHANGE_EVENT, cb);
}

/** Sayfa yolundaki dil önekini ve kimlikleri sadeleştirir: /tr/trainers/abc123 → /trainers/:id */
export function normalizePagePath(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] === "tr" || parts[0] === "en") parts.shift();
  return "/" + parts.map((p, i) => (i > 0 && /[0-9]/.test(p) && p.length >= 8 ? ":id" : p)).join("/");
}

let installed = false;

/** window hata/promise dinleyicilerini ve istek gözlemcisini bir kez kurar. Söküm gerekmez. */
export function installClientMonitoring(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (e: ErrorEvent) => {
    // Kaynak (img/script) yükleme hataları ErrorEvent değildir; yalnızca JS hataları.
    reportClientError(e.error ?? e.message, "window");
  });
  window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
    reportClientError(e.reason, "unhandledrejection");
  });

  if (typeof PerformanceObserver === "undefined") return;
  try {
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries() as PerformanceResourceTiming[];
      const api = entries.filter(
        (en) => (en.initiatorType === "fetch" || en.initiatorType === "xmlhttprequest") && en.name.includes("/api/")
      );
      if (api.length === 0) return;
      const page = normalizePagePath(window.location.pathname);
      const map = readJson<Record<string, Omit<RequestStat, "path">>>(REQUESTS_KEY, {});
      const s = map[page] ?? { count: 0, totalMs: 0, maxMs: 0, failed: 0 };
      for (const en of api) {
        s.count += 1;
        s.totalMs += Math.round(en.duration);
        s.maxMs = Math.max(s.maxMs, Math.round(en.duration));
        // responseStatus yalnız yeni tarayıcılarda var; 0 (bilinmiyor) sayılmaz.
        const status = (en as PerformanceResourceTiming & { responseStatus?: number }).responseStatus ?? 0;
        if (status >= 400) s.failed += 1;
      }
      map[page] = s;
      writeJson(REQUESTS_KEY, map);
    });
    observer.observe({ type: "resource", buffered: true });
  } catch {
    /* eski tarayıcı */
  }
}
