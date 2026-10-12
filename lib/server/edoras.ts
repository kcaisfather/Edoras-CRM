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
import {
  ADMIN_ACCOUNT_MESSAGES,
  adminEmailChangeBlock,
  edorasLoginKind,
  leavesNoActiveAdmin,
  normalizeLoginEmail,
} from "@/lib/domain/institutions/edoras-accounts";
import type { Compensator } from "./compensation";

/**
 * Edoras canlı veritabanına (edoras-admin + mobil) dokunan iki dosyadan biri (diğeri: edoras-usage.ts, salt okunur kullanım sinyalleri). Şema gerçeği edoras-admin'dedir
 * (Desktop/YKS → docs/memory/YKS/data-model.md); buradaki kolon adları oradan. Edoras şemasında hiçbir
 * değişiklik yapılmaz — yalnız okuma, demo kurum açma (edoras-admin'in scripts/seed-demo-presentation.mjs
 * ile aynı sıra: kurum → aktif yıl/dönem → auth kullanıcısı → profil → kurum üyeliği), kurumun panel modülü
 * satırı (`institution_panel_modules` upsert — edoras-admin migration 300 sözleşmesi) ve kurum yöneticisi
 * hesapları (giriş e-postası: Auth + `profiles.email`; şifre: Auth; aktiflik: `institution_users.is_active` +
 * `profiles.is_active` — yalnız role='admin' üyeliği olan kullanıcıda, kurallar lib/domain/institutions/edoras-accounts.ts).
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
      .select("user_id, is_active, profiles!institution_users_user_id_fkey(full_name, email, is_super_admin)")
      .eq("institution_id", id)
      .eq("role", "admin"),
    countRows(db, "students", { institution_id: id }),
    countRows(db, "institution_users", { institution_id: id, role: "teacher" }),
    countRows(db, "classes", { institution_id: id }),
  ]);
  if (admins.error) throw dbError(admins.error);

  type Profile = { full_name: string | null; email: string | null; is_super_admin: boolean | null };
  type AdminRow = { user_id: string; is_active: boolean | null; profiles: Profile | Profile[] | null };
  const rows = (admins.data ?? []) as AdminRow[];
  const otherMemberships = await countOtherMemberships(db, id, rows.map((a) => a.user_id));
  // Giriş e-postası profilden okunur (Auth'a kullanıcı başına istek atmamak için); CRM'den değişiklik ikisini birlikte
  // yazar. Hesap işlemleri yazmadan önce Auth'taki güncel adresle yeniden denetler (getEdorasAdminAccount).
  const adminList: InstitutionAdmin[] = rows.map((a) => {
    const profile = Array.isArray(a.profiles) ? a.profiles[0] : a.profiles;
    return {
      userId: a.user_id,
      fullName: profile?.full_name ?? null,
      email: profile?.email ?? null,
      isActive: a.is_active !== false,
      loginKind: edorasLoginKind(profile?.email),
      isSuperAdmin: profile?.is_super_admin === true,
      otherMembershipCount: otherMemberships.get(a.user_id) ?? 0,
    };
  });
  return { admins: adminList, usage: { students, teachers, classes } };
}

/** Kullanıcıların BAŞKA kurumlardaki `institution_users` satır sayısı (her rol). */
async function countOtherMemberships(db: SupabaseClient, institutionId: string, userIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (userIds.length === 0) return counts;
  const { data, error } = await db
    .from("institution_users")
    .select("user_id, institution_id")
    .in("user_id", userIds)
    .neq("institution_id", institutionId);
  if (error) throw dbError(error);
  for (const row of (data ?? []) as { user_id: string; institution_id: string | null }[]) {
    counts.set(row.user_id, (counts.get(row.user_id) ?? 0) + 1);
  }
  return counts;
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

/**
 * edoras-admin'in auth_user_email_taken RPC'si (migration 019; büyük harf / boşluk duyarsız). `excludeUserId`: o
 * kullanıcının kendi adresi sayılmaz (giriş e-postası değişikliği).
 */
export async function isEdorasEmailTaken(email: string, excludeUserId?: string): Promise<boolean> {
  const { data, error } = await getEdorasAdminClient().rpc("auth_user_email_taken", {
    p_email: email,
    ...(excludeUserId ? { p_exclude_user_id: excludeUserId } : {}),
  });
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

// ─── Kurum yöneticisi hesapları (Kurum ayrıntısı → Kurum yöneticileri; yalnız ADMIN) ───

interface EdorasAdminAccount {
  /** Auth'taki güncel giriş adresi (kurallar bununla denetlenir; ekrandaki `profiles.email` değil). */
  authEmail: string | null;
  profileEmail: string | null;
  /** Bu kurumdaki yönetici üyeliği aktif mi. */
  isActive: boolean;
}

/**
 * Hesap işlemlerinin ortak kapısı: (kurum, kullanıcı, role='admin') üyeliği yoksa 404 — CRM başka kurumun ya da
 * yönetici olmayan birinin hesabına dokunamaz. Edoras süper yöneticisi 403.
 */
async function getEdorasAdminAccount(db: SupabaseClient, institutionId: string, userId: string): Promise<EdorasAdminAccount> {
  const { data: memberships, error: memberError } = await db
    .from("institution_users")
    .select("is_active")
    .eq("institution_id", institutionId)
    .eq("user_id", userId)
    .eq("role", "admin")
    .limit(5);
  if (memberError) throw dbError(memberError);
  const rows = (memberships ?? []) as { is_active: boolean | null }[];
  if (rows.length === 0) throw new HttpError(404, "NOT_FOUND");

  const [profile, auth] = await Promise.all([
    db.from("profiles").select("email, is_super_admin").eq("id", userId).maybeSingle(),
    db.auth.admin.getUserById(userId),
  ]);
  if (profile.error) throw dbError(profile.error);
  if (auth.error || !auth.data.user) {
    if (auth.error?.status === 404) throw new HttpError(404, "NOT_FOUND");
    throw new HttpError(502, "INTERNAL", undefined, `edoras:getUser:${auth.error?.status ?? "no-user"}`);
  }
  const profileRow = profile.data as { email: string | null; is_super_admin: boolean | null } | null;
  if (profileRow?.is_super_admin === true) throw new HttpError(403, "EDORAS_SUPER_ADMIN");
  return {
    authEmail: auth.data.user.email ?? null,
    profileEmail: profileRow?.email ?? null,
    isActive: rows.some((r) => r.is_active !== false),
  };
}

/**
 * Giriş e-postasını değiştirir (edoras-admin `updateTeacherForAdmin` ile aynı sıra): kurallar → Auth'ta başka hesapta
 * var mı → Auth (`email_confirm: true`: onay e-postası gitmez; eski adresle giriş hemen biter, şifre değişmez) →
 * `profiles.email`. Edoras'ta auth.users → profiles tetikleyicisi yok, profil ayrıca yazılır. İki yazım arasında
 * transaction yok: profil yazılamazsa Auth eski adrese döndürülür. Değişiklik HESABIN tamamına işler (başka kurumdaki
 * üyelikler dahil; aynı hesabın veli girişi telefonla adresi aramayla bulduğu için kırılmaz).
 */
export async function updateEdorasAdminEmail(
  institutionId: string,
  userId: string,
  rawEmail: string
): Promise<{ changed: boolean }> {
  const db = getEdorasAdminClient();
  const account = await getEdorasAdminAccount(db, institutionId, userId);
  const email = normalizeLoginEmail(rawEmail);
  const block = adminEmailChangeBlock({ currentEmail: account.authEmail, nextEmail: email, isSuperAdmin: false });
  if (block === "loginNotEmail") throw new HttpError(409, "EDORAS_LOGIN_NOT_EMAIL");
  if (block === "reservedDomain") throw new HttpError(400, "VALIDATION", { email: ADMIN_ACCOUNT_MESSAGES.emailReserved });
  if (block === "same") {
    // Auth zaten bu adreste; profil geride kaldıysa (elle düzeltme kalıntısı) eşitlenir.
    if (normalizeLoginEmail(account.profileEmail ?? "") !== email) {
      const { error } = await db.from("profiles").update({ email }).eq("id", userId);
      if (error) throw dbError(error);
    }
    return { changed: false };
  }

  if (await isEdorasEmailTaken(email, userId)) throw new HttpError(409, "EMAIL_TAKEN");

  const { error: authError } = await db.auth.admin.updateUserById(userId, { email, email_confirm: true });
  if (authError) {
    if (authError.status === 422 || /already/i.test(authError.message)) throw new HttpError(409, "EMAIL_TAKEN");
    throw new HttpError(502, "INTERNAL", undefined, `edoras:updateUser:${authError.status ?? "?"}`);
  }

  const { error: profileError } = await db.from("profiles").update({ email }).eq("id", userId);
  if (profileError) {
    if (account.authEmail) {
      const { error: restoreError } = await db.auth.admin.updateUserById(userId, { email: account.authEmail, email_confirm: true });
      // Kişisel veri loglanmaz: yalnız durum kodu.
      if (restoreError) console.error(`[edoras] giriş e-postası geri alınamadı (${restoreError.status ?? "?"})`);
    }
    throw dbError(profileError);
  }
  return { changed: true };
}

/**
 * Yeni şifre yazar (eski şifreyle giriş hemen biter). Şifreyi çağıran üretir ve yalnız yanıtta bir kez gösterir;
 * Edoras da şifre saklamaz (`user_metadata.initial_password` bilinçli olarak kaldırıldı — JWT'ye giriyordu).
 * Dönüş: girişte yazılacak kimliği kurmak için Auth'taki adres.
 */
export async function setEdorasAdminPassword(
  institutionId: string,
  userId: string,
  password: string
): Promise<{ authEmail: string | null }> {
  const db = getEdorasAdminClient();
  const account = await getEdorasAdminAccount(db, institutionId, userId);
  const { error } = await db.auth.admin.updateUserById(userId, { password });
  if (error) throw new HttpError(502, "INTERNAL", undefined, `edoras:updatePassword:${error.status ?? "?"}`);
  return { authEmail: account.authEmail };
}

/**
 * Yönetici üyeliğini bu kurumda aktif / pasif yapar (edoras-admin `setTeacherActiveForAdmin` gibi: hesap silinmez,
 * ban yok). Pasif yöneticiyi mobil uygulama içeri almaz (veliyse veli olarak girer) ve personel RLS'i
 * (`iu.is_active = true`) okumayı keser. ⚠️ edoras-admin WEB paneli (resolve_user_role / middleware /
 * getAdminInstitutionContext) bugün `is_active`'i yalnız öğretmende uygular — pasif yönetici web paneline girebilir.
 *
 * `profiles.is_active` (Edoras'ta kapı değil, gösterim bayrağı) aktifleşince açılır; pasifte yalnız kişinin başka AKTİF
 * personel üyeliği yoksa kapanır. Kurumdaki son aktif yönetici `confirmLastAdmin` olmadan pasife alınmaz (409).
 */
export async function setEdorasAdminActive(
  institutionId: string,
  userId: string,
  active: boolean,
  confirmLastAdmin: boolean
): Promise<{ changed: boolean }> {
  const db = getEdorasAdminClient();
  const account = await getEdorasAdminAccount(db, institutionId, userId);
  if (account.isActive === active) return { changed: false };

  if (!active) {
    const { data, error } = await db
      .from("institution_users")
      .select("user_id, is_active")
      .eq("institution_id", institutionId)
      .eq("role", "admin");
    if (error) throw dbError(error);
    const admins = ((data ?? []) as { user_id: string; is_active: boolean | null }[]).map((r) => ({
      userId: r.user_id,
      isActive: r.is_active !== false,
    }));
    if (leavesNoActiveAdmin(admins, userId) && !confirmLastAdmin) throw new HttpError(409, "EDORAS_LAST_ADMIN");
  }

  // Önce üyelik (asıl kapı): sonraki adım düşse bile durum değişmiş olur; işlem tekrar çalıştırılabilir.
  const { error: memberError } = await db
    .from("institution_users")
    .update({ is_active: active })
    .eq("institution_id", institutionId)
    .eq("user_id", userId)
    .eq("role", "admin");
  if (memberError) throw dbError(memberError);

  let profileActive: boolean | null = active ? true : null;
  if (!active) {
    const { data, error } = await db.from("institution_users").select("institution_id, role, is_active").eq("user_id", userId);
    if (error) throw dbError(error);
    type MembershipRow = { institution_id: string | null; role: string | null; is_active: boolean | null };
    const otherActiveStaff = ((data ?? []) as MembershipRow[]).some(
      (r) =>
        (r.role === "admin" || r.role === "teacher") &&
        r.is_active !== false &&
        !(r.institution_id === institutionId && r.role === "admin")
    );
    if (!otherActiveStaff) profileActive = false;
  }
  if (profileActive !== null) {
    const { error } = await db.from("profiles").update({ is_active: profileActive }).eq("id", userId);
    if (error) throw dbError(error);
  }
  return { changed: true };
}
