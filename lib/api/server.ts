import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";
import { MissingEnvError } from "@/lib/env";
import { createSupabaseServerClient, getSupabaseAdminClient } from "@/lib/supabase/server";
import type { PanelRole } from "@/lib/domain/auth/types";
import type { ApiErrorBody, ApiErrorCode } from "./error-codes";
import { mapDbError, type DbErrorLike } from "./db-errors";

const NO_STORE = { "Cache-Control": "no-store" };

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ApiErrorCode,
    public readonly fields?: Record<string, string>,
    /** Log için güvenli özet. */
    public readonly reason?: string
  ) {
    super(code);
    this.name = "HttpError";
  }
}

/** Supabase `{ error }` → HttpError (veritabanı mesajının yalnız kodu/kısıt adı kullanılır). */
export function dbError(err: DbErrorLike): HttpError {
  const mapped = mapDbError(err);
  return new HttpError(mapped.status, mapped.code, undefined, mapped.reason);
}

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: NO_STORE });
}

function toHttpError(err: unknown): HttpError {
  if (err instanceof HttpError) return err;
  if (err instanceof MissingEnvError) return new HttpError(503, "CONFIG_MISSING", undefined, `env:${err.variable}`);
  return new HttpError(500, "INTERNAL", undefined, err instanceof Error ? err.name : "unknown");
}

/** Uç sarmalayıcı: her hata { error: { code } } olarak döner; 5xx'ler (kişisel veri olmadan) loglanır. */
export function route<Args extends unknown[]>(handler: (...args: Args) => Promise<Response>) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (err) {
      const e = toHttpError(err);
      if (e.status >= 500) console.error(`[api] ${e.code}${e.reason ? ` (${e.reason})` : ""}`);
      const body: ApiErrorBody = { error: { code: e.code, ...(e.fields ? { fields: e.fields } : {}) } };
      return NextResponse.json(body, { status: e.status, headers: NO_STORE });
    }
  };
}

/**
 * Yazma isteği başka bir siteden gelemez (CSRF'e ek savunma; oturum çerezi zaten SameSite=Lax).
 * Tarayıcı Origin gönderiyorsa panelin kendi adresi olmalı.
 */
function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  let originHost: string | null = null;
  try {
    originHost = new URL(origin).host;
  } catch {
    // Geçersiz Origin → reddedilir.
  }
  if (!host || originHost !== host) throw new HttpError(403, "FORBIDDEN", undefined, "origin");
}

/** Yazma isteğinin JSON gövdesini şemayla doğrular; hata → 400 VALIDATION + alan mesajları. */
export async function parseBody<S extends z.ZodType>(request: Request, schema: S): Promise<z.output<S>> {
  assertSameOrigin(request);
  const raw: unknown = await request.json().catch(() => {
    throw new HttpError(400, "VALIDATION");
  });
  const result = schema.safeParse(raw);
  if (!result.success) {
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join(".") || "_";
      fields[key] ??= issue.message;
    }
    throw new HttpError(400, "VALIDATION", fields);
  }
  return result.data;
}

export interface StaffContext {
  userId: string;
  email: string | null;
  fullName: string | null;
  role: PanelRole;
}

/**
 * Kapı: oturum (CRM projesinin Supabase Auth'u, imza sunucuda doğrulanır) + crm_staff kaydı (aktif).
 * `role: "ADMIN"` verilirse CRM_AGENT 403 alır. İki veritabanına da service_role ile yalnız bu kapıdan
 * sonra gidilir.
 */
export async function requireStaff(options: { role?: "ADMIN" } = {}): Promise<StaffContext> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new HttpError(401, "UNAUTHORIZED");

  const { data: staff, error } = await getSupabaseAdminClient()
    .from("crm_staff")
    .select("role, is_active, full_name")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw dbError(error);
  if (!staff || !staff.is_active) throw new HttpError(403, "NOT_STAFF");

  const role = staff.role as PanelRole;
  if (options.role === "ADMIN" && role !== "ADMIN") throw new HttpError(403, "FORBIDDEN");
  return { userId: user.id, email: user.email ?? null, fullName: (staff.full_name as string | null) ?? null, role };
}

/** UUID biçimi (yol parametresi) — hatalıysa 404. */
export function requireUuid(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new HttpError(404, "NOT_FOUND");
  }
  return value;
}
