import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getEdorasAdminClient } from "@/lib/supabase/server";
import { HttpError, dbError } from "@/lib/api/server";
import type { AcademicPeriod } from "@/lib/domain/institutions/rules";
import {
  mergePanelModules,
  type InstitutionPanelModuleRow,
  type PanelModuleCatalogRow,
  type PanelModuleState,
} from "@/lib/domain/institutions/panel-modules";
import type { InstitutionAdmin, InstitutionProgram, InstitutionUsage } from "@/lib/domain/institutions/types";
import type { Compensator } from "./compensation";

/**
 * Edoras canlı veritabanına (edoras-admin + mobil) dokunan iki dosyadan biri (diğeri: edoras-usage.ts, salt okunur kullanım sinyalleri). Şema gerçeği edoras-admin'dedir
 * (Desktop/YKS → docs/memory/YKS/data-model.md); buradaki kolon adları oradan. Edoras şemasında hiçbir
 * değişiklik yapılmaz — yalnız okuma, demo kurum açma (edoras-admin'in scripts/seed-demo-presentation.mjs
 * ile aynı sıra: kurum → aktif yıl/dönem → auth kullanıcısı → profil → kurum üyeliği) ve kurumun panel modülü
 * satırı (`institution_panel_modules` upsert — edoras-admin migration 300 sözleşmesi).
 */

export interface EdorasInstitution {
  id: string;
  name: string;
  program: InstitutionProgram;
  isActive: boolean;
  createdAt: string | null;
}

interface InstitutionRow {
  id: string;
  name: string;
  program: InstitutionProgram;
  is_active: boolean | null;
  created_at: string | null;
}

function toInstitution(row: InstitutionRow): EdorasInstitution {
  return {
    id: row.id,
    name: row.name,
    program: row.program,
    // Edoras'ta is_active null olabilir (eski satırlar); null = aktif.
    isActive: row.is_active !== false,
    createdAt: row.created_at,
  };
}

const INSTITUTION_COLUMNS = "id, name, program, is_active, created_at";

/** PostgREST sayfa sınırını (varsayılan 1000 satır) aşmak için sayfa sayfa okur. */
export async function fetchAll<T>(
  query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { code?: string; message?: string } | null }>
): Promise<T[]> {
  const pageSize = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await query(from, from + pageSize - 1);
    if (error) throw dbError(error);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) return rows;
  }
}

export async function listEdorasInstitutions(): Promise<EdorasInstitution[]> {
  const db = getEdorasAdminClient();
  const rows = await fetchAll<InstitutionRow>((a, b) =>
    db.from("institutions").select(INSTITUTION_COLUMNS).order("name").range(a, b)
  );
  return rows.map(toInstitution);
}

export async function getEdorasInstitution(id: string): Promise<EdorasInstitution | null> {
  const { data, error } = await getEdorasAdminClient()
    .from("institutions")
    .select(INSTITUTION_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw dbError(error);
  return data ? toInstitution(data as InstitutionRow) : null;
}

async function countRows(db: SupabaseClient, table: string, filter: Record<string, string>): Promise<number> {
  let query = db.from(table).select("id", { count: "exact", head: true });
  for (const [column, value] of Object.entries(filter)) query = query.eq(column, value);
  const { count, error } = await query;
  if (error) throw dbError(error);
  return count ?? 0;
}

/** Kurum yöneticileri + öğrenci/öğretmen/sınıf sayıları (ayrıntı sayfası). */
export async function getEdorasInstitutionExtras(
  id: string
): Promise<{ admins: InstitutionAdmin[]; usage: InstitutionUsage }> {
  const db = getEdorasAdminClient();
  const [admins, students, teachers, classes] = await Promise.all([
    db
      .from("institution_users")
      .select("user_id, is_active, profiles!institution_users_user_id_fkey(full_name, email)")
      .eq("institution_id", id)
      .eq("role", "admin"),
    countRows(db, "students", { institution_id: id }),
    countRows(db, "institution_users", { institution_id: id, role: "teacher" }),
    countRows(db, "classes", { institution_id: id }),
  ]);
  if (admins.error) throw dbError(admins.error);

  type Profile = { full_name: string | null; email: string | null };
  type AdminRow = { user_id: string; is_active: boolean | null; profiles: Profile | Profile[] | null };
  const adminList = ((admins.data ?? []) as AdminRow[]).map((a) => {
    const profile = Array.isArray(a.profiles) ? a.profiles[0] : a.profiles;
    return {
      userId: a.user_id,
      fullName: profile?.full_name ?? null,
      email: profile?.email ?? null,
      isActive: a.is_active !== false,
    };
  });
  return { admins: adminList, usage: { students, teachers, classes } };
}

/** Türkçe büyük/küçük harfe duyarsız ad karşılaştırması. */
function nameKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("tr");
}

export async function isEdorasInstitutionNameTaken(name: string): Promise<boolean> {
  const db = getEdorasAdminClient();
  const rows = await fetchAll<{ name: string }>((a, b) => db.from("institutions").select("name").order("id").range(a, b));
  const key = nameKey(name);
  return rows.some((r) => nameKey(r.name) === key);
}

/** edoras-admin'in auth_user_email_taken RPC'si (migration 019). */
export async function isEdorasEmailTaken(email: string): Promise<boolean> {
  const { data, error } = await getEdorasAdminClient().rpc("auth_user_email_taken", { p_email: email });
  if (error) throw dbError(error);
  return data === true;
}

export interface EdorasDemoInput {
  institutionName: string;
  program: InstitutionProgram;
  adminName: string;
  adminEmail: string;
  password: string;
  period: AcademicPeriod;
}

/**
 * Edoras'ta demo kurum açar: kurum + aktif öğretim yılı/dönemi + kurum yöneticisi (Auth + profil +
 * üyelik). Her başarılı adım `compensator`'a geri alma işini yazar; çağıran sonraki bir adım (CRM kaydı)
 * patlarsa `rollback()` ile hepsini siler. Aktif dönem şart: dönemi olmayan kurumda edoras-admin'in
 * yoklama/ödev/program ekranları "Aktif akademik dönem bulunamadı" verir.
 */
export async function createEdorasDemo(input: EdorasDemoInput, compensator: Compensator): Promise<{ institutionId: string }> {
  const db = getEdorasAdminClient();

  const { data: inst, error: instError } = await db
    .from("institutions")
    .insert({ name: input.institutionName, program: input.program, is_active: true })
    .select("id")
    .single();
  if (instError || !inst) throw instError ? dbError(instError) : new HttpError(500, "INTERNAL", undefined, "edoras:institution");
  const institutionId = inst.id as string;
  compensator.push("edoras:institution", async () => {
    // Açtığımız satırlar açıkça silinir (kaskada güvenilmez), sonra kurum. Edoras'ta düz DELETE
    // institutions_prevent_delete tetikleyicisine takılır (edoras-admin migration 192); bilinçli silme
    // yolu adı birebir teyit eden delete_institution_guarded RPC'si.
    for (const table of ["institution_users", "academic_terms", "academic_years"]) {
      const { error } = await db.from(table).delete().eq("institution_id", institutionId);
      if (error) throw error;
    }
    const { error } = await db.rpc("delete_institution_guarded", {
      p_institution_id: institutionId,
      p_confirm_name: input.institutionName,
    });
    if (error) throw error;
  });

  const { data: year, error: yearError } = await db
    .from("academic_years")
    .insert({
      institution_id: institutionId,
      name: input.period.yearName,
      start_date: input.period.yearStart,
      end_date: input.period.yearEnd,
      is_active: true,
    })
    .select("id")
    .single();
  if (yearError || !year) throw yearError ? dbError(yearError) : new HttpError(500, "INTERNAL", undefined, "edoras:year");

  const { error: termError } = await db.from("academic_terms").insert({
    institution_id: institutionId,
    academic_year_id: year.id,
    name: input.period.termName,
    start_date: input.period.termStart,
    end_date: input.period.termEnd,
    is_active: true,
  });
  if (termError) throw dbError(termError);

  const { data: created, error: authError } = await db.auth.admin.createUser({
    email: input.adminEmail,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.adminName },
  });
  if (authError || !created.user) {
    if (authError && (authError.status === 422 || /already/i.test(authError.message))) {
      throw new HttpError(409, "EMAIL_TAKEN");
    }
    throw new HttpError(502, "INTERNAL", undefined, `edoras:createUser:${authError?.status ?? "no-user"}`);
  }
  const userId = created.user.id;
  compensator.push("edoras:auth-user", async () => {
    const { error: profileError } = await db.from("profiles").delete().eq("id", userId);
    if (profileError) throw profileError;
    const { error } = await db.auth.admin.deleteUser(userId);
    if (error) throw error;
  });

  const { error: profileError } = await db
    .from("profiles")
    .upsert({ id: userId, full_name: input.adminName, email: input.adminEmail, is_active: true }, { onConflict: "id" });
  if (profileError) throw dbError(profileError);

  const { error: memberError } = await db
    .from("institution_users")
    .insert({ institution_id: institutionId, user_id: userId, role: "admin", is_active: true });
  if (memberError) throw dbError(memberError);
  // Üyelik profili gösteriyor: geri alırken profil/kullanıcıdan ÖNCE silinmeli (ters sıra bunu sağlar).
  compensator.push("edoras:membership", async () => {
    const { error } = await db.from("institution_users").delete().eq("institution_id", institutionId).eq("user_id", userId);
    if (error) throw error;
  });

  return { institutionId };
}

// ─── Panel modülleri (edoras-admin migration 300) ───

const PANEL_MODULE_CATALOG_COLUMNS = "key, label, description, default_enabled, sort_order";
const INSTITUTION_PANEL_MODULE_COLUMNS = "module_key, enabled, updated_at, updated_by";

/** Kurumun modül durumları (katalog ∪ kurum satırı). Kurum Edoras'ta yoksa 404. */
export async function getEdorasPanelModules(institutionId: string): Promise<PanelModuleState[]> {
  const db = getEdorasAdminClient();
  const [institution, catalog, rows] = await Promise.all([
    getEdorasInstitution(institutionId),
    db.from("panel_modules").select(PANEL_MODULE_CATALOG_COLUMNS),
    db.from("institution_panel_modules").select(INSTITUTION_PANEL_MODULE_COLUMNS).eq("institution_id", institutionId),
  ]);
  if (!institution) throw new HttpError(404, "NOT_FOUND");
  if (catalog.error) throw dbError(catalog.error);
  if (rows.error) throw dbError(rows.error);
  return mergePanelModules(
    (catalog.data ?? []) as PanelModuleCatalogRow[],
    (rows.data ?? []) as InstitutionPanelModuleRow[]
  );
}

/**
 * Tek modülü kurumda açar / kapatır (satır yoksa ekler). Kapatmak Edoras'ta VERİ SİLMEZ — yalnız menü, sayfa ve
 * veri uçları kapanır. `updatedBy` Edoras'taki iz alanıdır (`crm:<ad>`). Katalogda olmayan anahtar 404.
 * Dönüş: kurumun güncel listesi.
 */
export async function setEdorasPanelModule(
  institutionId: string,
  key: string,
  enabled: boolean,
  updatedBy: string
): Promise<PanelModuleState[]> {
  const db = getEdorasAdminClient();
  const { data: module, error: moduleError } = await db.from("panel_modules").select("key").eq("key", key).maybeSingle();
  if (moduleError) throw dbError(moduleError);
  if (!module) throw new HttpError(404, "NOT_FOUND");
  if (!(await getEdorasInstitution(institutionId))) throw new HttpError(404, "NOT_FOUND");

  const { error } = await db
    .from("institution_panel_modules")
    .upsert(
      { institution_id: institutionId, module_key: key, enabled, updated_by: updatedBy },
      { onConflict: "institution_id,module_key" }
    );
  if (error) throw dbError(error);
  return getEdorasPanelModules(institutionId);
}
