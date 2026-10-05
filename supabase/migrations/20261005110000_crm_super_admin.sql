-- =============================================================================
-- EdorasCRM · 20261005110000 — süper admin (tek kurucu)
--
-- NEREYE: EdorasCRM'in kendi Supabase projesi (orishbqniebbgdanazrp). Edoras'a dokunmaz.
-- NEDEN: Ekip / rol yönetimi (kişi ekleme, rol değiştirme, pasifleştirme, şifre sıfırlama) yalnız süper admindedir.
--
--   * crm_staff.is_super: en çok BİR satır true olabilir (kısmi tekil indeks). Süper admin her zaman aktif ADMIN'dir
--     (CHECK). Bayrak sonradan kaldırılamaz, satır silinemez; rolü ve aktifliği değiştirilemez (tetikleyici).
--   * Süper adminin kendisi bu migration'da atanmaz (e-posta koda yazılmaz): service_role ile
--       update public.crm_staff set is_super = true where user_id = '<kurucu>';
--     Süper admin ADMIN yetkilerine aynen sahiptir; PanelRole değişmez (ADMIN | CRM_AGENT).
--
-- GÜVENLİK: RLS/grant değişmez (yalnız service_role). Tetikleyici fonksiyonu PUBLIC'ten geri alındı.
-- Geri almak: dosyanın sonundaki "GERİ ALMA" bloğu.
-- =============================================================================

begin;

alter table public.crm_staff add column if not exists is_super boolean not null default false;

comment on column public.crm_staff.is_super is
  'Süper admin (en çok bir satır): ekip/rol yönetimi yalnız bunda. Her zaman aktif ADMIN; bayrak kaldırılamaz.';

create unique index if not exists crm_staff_single_super on public.crm_staff (is_super) where is_super;

alter table public.crm_staff
  add constraint crm_staff_super_admin_check check (not is_super or (role = 'ADMIN' and is_active));

create or replace function public.crm_staff_protect_super()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if old.is_super then
      raise exception 'CRM_SUPER_ADMIN_PROTECTED' using hint = 'Süper admin silinemez.';
    end if;
    return old;
  end if;
  if old.is_super and (not new.is_super or new.role <> 'ADMIN' or not new.is_active) then
    raise exception 'CRM_SUPER_ADMIN_PROTECTED' using hint = 'Süper adminin bayrağı, rolü ve aktifliği değiştirilemez.';
  end if;
  return new;
end;
$$;

-- Ad sırasıyla crm_staff_keep_admin'den ("crm_staff_keep_admin" < "crm_staff_protect_super") sonra çalışır.
drop trigger if exists crm_staff_protect_super on public.crm_staff;
create trigger crm_staff_protect_super
  before update or delete on public.crm_staff
  for each row execute function public.crm_staff_protect_super();

revoke execute on function public.crm_staff_protect_super() from public, anon, authenticated;

commit;

-- =============================================================================
-- GERİ ALMA:
--   begin;
--   drop trigger if exists crm_staff_protect_super on public.crm_staff;
--   drop function if exists public.crm_staff_protect_super();
--   alter table public.crm_staff drop constraint if exists crm_staff_super_admin_check;
--   drop index if exists public.crm_staff_single_super;
--   alter table public.crm_staff drop column if exists is_super;
--   commit;
-- =============================================================================
