-- =============================================================================
-- EdorasCRM · 20261005120000 — aday sorumlusu (owner_id)
--
-- NEREYE: EdorasCRM'in kendi Supabase projesi (orishbqniebbgdanazrp). Edoras'a dokunmaz.
-- NEDEN: Her adayın tek bir sorumlu personeli olur (Adaylar listesinde süzme, satış performansı, toplu atama).
--
--   * crm_leads.owner_id: crm_staff(user_id) FK — yalnız CRM ekibinden biri olabilir. Personel silinirse null.
--   * Ekleme sırasında boşsa created_by'dan (ekipte ise) doldurulur → her yazma yolu (el ile, içe aktarma,
--     soğuk liste, Edoras kaydı) sorumlusuz aday üretmez. Güncellemede dokunulmaz.
--   * Mevcut adaylar created_by'dan doldurulur (ekipte olanlar).
--   * Sorumlu değişikliğini yalnız ADMIN yapar — kural sunucuda (PATCH /api/crm/leads/{id}).
--
-- GÜVENLİK: RLS/grant değişmez (yalnız service_role). Tetikleyici fonksiyonu PUBLIC'ten geri alındı.
-- Geri almak: dosyanın sonundaki "GERİ ALMA" bloğu.
-- =============================================================================

begin;

alter table public.crm_leads
  add column if not exists owner_id uuid references public.crm_staff(user_id) on delete set null;

comment on column public.crm_leads.owner_id is
  'Aday sorumlusu (CRM ekibinden). Eklemede boşsa created_by; değiştirmek yalnız ADMIN.';

create index if not exists crm_leads_owner_idx on public.crm_leads (owner_id) where owner_id is not null;

update public.crm_leads l
   set owner_id = l.created_by
 where l.owner_id is null
   and l.created_by is not null
   and exists (select 1 from public.crm_staff s where s.user_id = l.created_by);

create or replace function public.crm_leads_owner_default()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.owner_id is null and new.created_by is not null
     and exists (select 1 from public.crm_staff s where s.user_id = new.created_by) then
    new.owner_id := new.created_by;
  end if;
  return new;
end;
$$;

drop trigger if exists crm_leads_owner_default on public.crm_leads;
create trigger crm_leads_owner_default
  before insert on public.crm_leads
  for each row execute function public.crm_leads_owner_default();

revoke execute on function public.crm_leads_owner_default() from public, anon, authenticated;

commit;

-- =============================================================================
-- GERİ ALMA (sorumlu bilgisi silinir):
--   begin;
--   drop trigger if exists crm_leads_owner_default on public.crm_leads;
--   drop function if exists public.crm_leads_owner_default();
--   drop index if exists public.crm_leads_owner_idx;
--   alter table public.crm_leads drop column if exists owner_id;
--   commit;
-- =============================================================================
