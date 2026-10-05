-- =============================================================================
-- EdorasCRM · 20261005190000 — lisans liste fiyatı + indirim yüzdesi; lisans / ödeme düzeltme koruması
--
-- NEREYE: EdorasCRM'in kendi Supabase projesi (orishbqniebbgdanazrp). Edoras'a dokunmaz.
-- NEDEN (müşteri geri bildirimi, 2026-10-05): "Yeni hesap oluştururken ödeme planını düzeltmeden kaydettim; sonra
--        düzenleme seçeneğini bulamadım." + "Paketlerdeki fiyatlarda sadece indirim yüzdeleri olacak."
-- KARAR (kurucu, 2026-10-05): tek liste fiyatı (Ayarlar, ADMIN); satışta indirim yüzdesi seçilir, bedel
--        hesaplanır; elle bedel yalnız istisna. Kayıttan sonra lisansın bedeli / indirimi / başlangıcı ve ödemeler
--        (tutar, tarih, yöntem, lisans, not; silme) ADMIN tarafından düzeltilebilir.
--
--   1) crm_license_pricing (tek satır): lisans liste fiyatı (KDV dahil TL). Boş = tanımlanmadı → panel yalnız elle
--      bedel alır.
--   2) crm_licenses.list_price / discount_percent: satış anındaki liste fiyatı ve indirim. Yüzde doluysa bedel
--      liste × (100 − yüzde) / 100'e (kuruşa yuvarlı) EŞİT olmalı → crm_licenses_discount_check. Elle bedelde
--      ikisi de boş. Eski satırlar ve crm_record_lead_sale (satış tutarı = bedel) etkilenmez: sütunlar NULL.
--   3) Faturası kesilmiş satış düzeltilemez: iptal edilmemiş (status <> 'CANCELLED') faturası olan lisansın bedeli /
--      tarihleri, ödemenin tutarı / tarihi / yöntemi / lisansı değişmez, ödeme silinmez → CRM_SALE_INVOICED.
--      (İptal edilmiş faturası olan ödemenin silinmesini FK crm_invoices_payment_id_fkey zaten engeller.)
--   4) Lisans bedeli düzelince kurumun "Satış oldu" adayının satış tutarı (eski bedele eşitse) da düzelir → açık bakiye.
--
-- GÜVENLİK: tablo RLS açık, politika yok (yalnız service_role); tetikleyici fonksiyonları PUBLIC'ten geri alındı.
-- Geri almak: dosyanın sonundaki "GERİ ALMA" bloğu.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1) Liste fiyatı (tek satır)
-- -----------------------------------------------------------------------------

create table if not exists public.crm_license_pricing (
  id smallint primary key default 1,
  list_price numeric(12, 2),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint crm_license_pricing_singleton_check check (id = 1),
  constraint crm_license_pricing_list_price_check check (list_price is null or list_price > 0)
);

comment on table public.crm_license_pricing is
  'Lisans liste fiyatı (tek satır, KDV dahil TL). Satışta yalnız indirim yüzdesi seçilir. Yalnız service_role.';

insert into public.crm_license_pricing (id) values (1) on conflict (id) do nothing;

drop trigger if exists crm_license_pricing_touch on public.crm_license_pricing;
create trigger crm_license_pricing_touch
  before update on public.crm_license_pricing
  for each row execute function public.crm_touch_updated_at();

-- -----------------------------------------------------------------------------
-- 2) Lisansta liste fiyatı + indirim
-- -----------------------------------------------------------------------------

alter table public.crm_licenses add column if not exists list_price numeric(12, 2);
alter table public.crm_licenses add column if not exists discount_percent numeric(5, 2);

alter table public.crm_licenses drop constraint if exists crm_licenses_list_price_check;
alter table public.crm_licenses add constraint crm_licenses_list_price_check
  check (list_price is null or list_price > 0);

alter table public.crm_licenses drop constraint if exists crm_licenses_discount_check;
alter table public.crm_licenses add constraint crm_licenses_discount_check
  check (
    discount_percent is null
    or (
      list_price is not null
      and discount_percent >= 0
      and discount_percent <= 100
      and price = round(list_price * (100 - discount_percent)) / 100
    )
  );

comment on column public.crm_licenses.list_price is
  'Satış anındaki liste fiyatı (crm_license_pricing). Elle bedelde ve eski satırlarda NULL.';
comment on column public.crm_licenses.discount_percent is
  'İndirim yüzdesi (0–100). Doluysa price = liste × (100 − yüzde) / 100. Elle bedelde NULL.';

-- -----------------------------------------------------------------------------
-- 3) Faturası kesilmiş satış düzeltilemez
-- -----------------------------------------------------------------------------

create or replace function public.crm_guard_license_invoiced()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if (new.price <> old.price
      or new.starts_on <> old.starts_on
      or new.ends_on <> old.ends_on
      or new.institution_id <> old.institution_id)
     and exists (
       select 1 from public.crm_invoices i where i.license_id = old.id and i.status <> 'CANCELLED'
     ) then
    raise exception 'CRM_SALE_INVOICED' using hint = 'Faturası kesilmiş lisans düzeltilemez; önce faturayı iptal edin.';
  end if;
  return new;
end;
$$;

drop trigger if exists crm_licenses_invoiced_guard on public.crm_licenses;
create trigger crm_licenses_invoiced_guard
  before update on public.crm_licenses
  for each row execute function public.crm_guard_license_invoiced();

create or replace function public.crm_guard_payment_invoiced()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if (tg_op = 'DELETE'
      or new.amount <> old.amount
      or new.paid_on <> old.paid_on
      or new.method <> old.method
      or new.license_id is distinct from old.license_id
      or new.institution_id <> old.institution_id)
     and exists (
       select 1 from public.crm_invoices i where i.payment_id = old.id and i.status <> 'CANCELLED'
     ) then
    raise exception 'CRM_SALE_INVOICED' using hint = 'Faturası kesilmiş ödeme düzeltilemez; önce faturayı iptal edin.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists crm_payments_invoiced_guard on public.crm_payments;
create trigger crm_payments_invoiced_guard
  before update or delete on public.crm_payments
  for each row execute function public.crm_guard_payment_invoiced();

-- -----------------------------------------------------------------------------
-- 4) Bağlı adayın satış tutarı lisans bedeliyle birlikte düzelir
--    CRM "satış / tahsil / açık bakiye" adayın sale_amount'ından hesaplanır; lisans bedeli düzeltilip aday eski
--    tutarda kalırsa bakiye yanlış görünür. Kurumun (tek) adayı "Satış oldu"daysa ve satış tutarı ESKİ bedele eşitse
--    (yani o satış bu lisanstır) yeni bedele çekilir. Farklıysa (çok lisanslı / elle düzeltilmiş satış) ya da yeni bedel
--    0 ise (satış tutarı > 0 kuralı) dokunulmaz.
-- -----------------------------------------------------------------------------

create or replace function public.crm_sync_lead_sale_amount()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.price <> old.price and new.price > 0 then
    update public.crm_leads l
       set sale_amount = new.price
     where l.institution_id = new.institution_id
       and l.status = 'SATIS_OLDU'
       and l.sale_amount = old.price;
  end if;
  return null;
end;
$$;

drop trigger if exists crm_licenses_sync_lead_sale on public.crm_licenses;
create trigger crm_licenses_sync_lead_sale
  after update of price on public.crm_licenses
  for each row execute function public.crm_sync_lead_sale_amount();

-- -----------------------------------------------------------------------------
-- 5) Yetkiler
-- -----------------------------------------------------------------------------

alter table public.crm_license_pricing enable row level security;
revoke all on table public.crm_license_pricing from public, anon, authenticated;
grant select, update on table public.crm_license_pricing to service_role;

revoke execute on function public.crm_guard_license_invoiced(), public.crm_guard_payment_invoiced(), public.crm_sync_lead_sale_amount()
  from public, anon, authenticated;

commit;

-- =============================================================================
-- GERİ ALMA (gerekirse elle; lisanslardaki liste fiyatı / indirim bilgisi silinir, bedeller kalır):
--   begin;
--   drop trigger if exists crm_licenses_sync_lead_sale on public.crm_licenses;
--   drop function if exists public.crm_sync_lead_sale_amount();
--   drop trigger if exists crm_payments_invoiced_guard on public.crm_payments;
--   drop trigger if exists crm_licenses_invoiced_guard on public.crm_licenses;
--   drop function if exists public.crm_guard_payment_invoiced(), public.crm_guard_license_invoiced();
--   alter table public.crm_licenses drop constraint if exists crm_licenses_discount_check;
--   alter table public.crm_licenses drop constraint if exists crm_licenses_list_price_check;
--   alter table public.crm_licenses drop column if exists discount_percent, drop column if exists list_price;
--   drop table if exists public.crm_license_pricing;
--   commit;
-- =============================================================================
