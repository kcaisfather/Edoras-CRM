-- =============================================================================
-- EdorasCRM · 20260929150000 — işlem kaydı, iç kurumlar, ekip kuralları
--
-- NEREYE: EdorasCRM'in kendi Supabase projesi (orishbqniebbgdanazrp). Edoras'a dokunmaz.
--
--   * crm_audit_logs: CRM personelinin yaptığı her yazma işlemi (demo açma, ücretliye geçiş, ödeme,
--     ekip değişikliği…). YALNIZ EKLENİR: güncelleme ve silme tetikleyiciyle engellidir — kaydın
--     sonradan değiştirilememesi denetim izinin anlamıdır. Kişisel veri (TC, VKN, adres, telefon)
--     `details`'e yazılmaz; kimlik ve kısa özet yeter.
--   * crm_internal_institutions: iç / sunum kurumları (ör. "SUNUM - …"). Metriklerden hariç tutulur.
--     DeepSportAdmin'deki "dahili / test hesapları" (G61) karşılığı; orada tarayıcıdaydı, burada ekipçe
--     paylaşılır.
--   * crm_staff: en az bir aktif ADMIN kalmalı (panel yöneticisiz kalmasın) → crm_staff_keep_admin.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1) İşlem kaydı
-- -----------------------------------------------------------------------------

create table if not exists public.crm_audit_logs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  actor_id uuid references auth.users(id) on delete set null,
  actor_name text,
  action text not null check (action ~ '^[A-Z][A-Z_]*$'),
  entity_type text not null check (entity_type ~ '^[a-z][a-z_]*$'),
  entity_id text,
  entity_label text,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object')
);

create index if not exists crm_audit_logs_created_idx on public.crm_audit_logs (created_at desc);
create index if not exists crm_audit_logs_entity_idx on public.crm_audit_logs (entity_type, entity_id, created_at desc);
create index if not exists crm_audit_logs_actor_idx on public.crm_audit_logs (actor_id, created_at desc);

create or replace function public.crm_audit_logs_append_only()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  raise exception 'CRM_AUDIT_APPEND_ONLY' using hint = 'İşlem kaydı değiştirilemez ve silinemez.';
end;
$$;

drop trigger if exists crm_audit_logs_no_update on public.crm_audit_logs;
create trigger crm_audit_logs_no_update
  before update or delete on public.crm_audit_logs
  for each row execute function public.crm_audit_logs_append_only();

drop trigger if exists crm_audit_logs_no_truncate on public.crm_audit_logs;
create trigger crm_audit_logs_no_truncate
  before truncate on public.crm_audit_logs
  for each statement execute function public.crm_audit_logs_append_only();

-- -----------------------------------------------------------------------------
-- 2) İç / sunum kurumları (Edoras institutions.id — başka veritabanı, FK yok)
-- -----------------------------------------------------------------------------

create table if not exists public.crm_internal_institutions (
  institution_id uuid primary key,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 3) Ekip: kaydı açanı tut, son aktif ADMIN'i koru
-- -----------------------------------------------------------------------------

alter table public.crm_staff
  add column if not exists created_by uuid references auth.users(id) on delete set null;

create or replace function public.crm_staff_keep_admin()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Eski satır aktif bir ADMIN değilse ya da güncellemeden sonra da aktif ADMIN ise sorun yok.
  if old.role <> 'ADMIN' or not old.is_active then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' and new.role = 'ADMIN' and new.is_active then
    return new;
  end if;
  if not exists (
    select 1 from public.crm_staff s
     where s.user_id <> old.user_id and s.role = 'ADMIN' and s.is_active
  ) then
    raise exception 'CRM_LAST_ADMIN' using hint = 'En az bir aktif yönetici kalmalı.';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists crm_staff_keep_admin on public.crm_staff;
create trigger crm_staff_keep_admin
  before update or delete on public.crm_staff
  for each row execute function public.crm_staff_keep_admin();

-- -----------------------------------------------------------------------------
-- 4) Yetkiler — yalnız service_role
-- -----------------------------------------------------------------------------

alter table public.crm_audit_logs enable row level security;
alter table public.crm_internal_institutions enable row level security;

revoke all on table public.crm_audit_logs, public.crm_internal_institutions from public, anon, authenticated;
grant select, insert on table public.crm_audit_logs to service_role;
grant select, insert, update, delete on table public.crm_internal_institutions to service_role;
revoke all on sequence public.crm_audit_logs_id_seq from public, anon, authenticated;
grant usage on sequence public.crm_audit_logs_id_seq to service_role;

revoke execute on function public.crm_audit_logs_append_only(), public.crm_staff_keep_admin()
  from public, anon, authenticated;

commit;

-- =============================================================================
-- GERİ ALMA:
--   begin;
--   drop trigger if exists crm_staff_keep_admin on public.crm_staff;
--   drop function if exists public.crm_staff_keep_admin();
--   alter table public.crm_staff drop column if exists created_by;
--   drop table if exists public.crm_internal_institutions, public.crm_audit_logs;
--   drop function if exists public.crm_audit_logs_append_only();
--   commit;
-- =============================================================================
