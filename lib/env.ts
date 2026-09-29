/**
 * Ortam değişkenleri. NEXT_PUBLIC_* değerleri derleme anında gömülür, o yüzden doğrudan
 * `process.env.X` yazılır (dinamik erişim gömülmez). Gizli anahtar (service role) burada DEĞİL:
 * yalnız lib/supabase/server.ts okur.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** Kurum yöneticilerinin girdiği Edoras paneli (demo giriş bilgisinde gösterilir). */
export const EDORAS_PANEL_URL = process.env.NEXT_PUBLIC_EDORAS_PANEL_URL || "https://panel.edorasapp.ai";

/** Eksik ortam değişkeni — API uçları bunu 503 CONFIG_MISSING olarak döner. */
export class MissingEnvError extends Error {
  constructor(public readonly variable: string) {
    super(`${variable} tanımlı değil (.env.local dosyasına bakın; örnek: .env.example)`);
    this.name = "MissingEnvError";
  }
}

export function requireEnv(name: string, value: string | undefined): string {
  if (!value) throw new MissingEnvError(name);
  return value;
}
