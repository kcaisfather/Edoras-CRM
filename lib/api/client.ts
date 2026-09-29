/**
 * Panelin kendi /api/* uçlarına istemci. Oturum çerezle gider (aynı origin); token saklanmaz.
 */
import { isApiErrorCode, type ApiErrorCode, type ApiErrorBody } from "./error-codes";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: ApiErrorCode | null = null,
    public fields?: Record<string, string>
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Oturum düştüyse girişe yollar (React dışı: router yok). Giriş sayfasındaysa dokunmaz. */
function handleUnauthorized() {
  if (typeof window === "undefined") return;
  if (window.location.pathname.startsWith("/login")) return;
  window.location.href = "/login";
}

export async function apiRequest<T>(
  path: string,
  options: { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown; signal?: AbortSignal } = {}
): Promise<T> {
  const { method = "GET", body, signal } = options;
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      signal,
      credentials: "same-origin",
      cache: "no-store",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError("Network error", 0);
  }

  const data: unknown = await res.json().catch(() => null);
  if (res.ok) return data as T;

  if (res.status === 401) handleUnauthorized();
  const error = (data as Partial<ApiErrorBody> | null)?.error;
  const code = isApiErrorCode(error?.code) ? error.code : null;
  throw new ApiError(code ?? `HTTP ${res.status}`, res.status, code, error?.fields);
}
