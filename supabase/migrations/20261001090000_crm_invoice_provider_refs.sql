-- =============================================================================
-- 20261001090000_crm_invoice_provider_refs — Paraşüt istemcisi için sağlayıcı referansları
--
-- Platform (PROVIDER) faturası Paraşüt'te iki adımda kesilir: satış faturası (taslak) → resmileştirme (e-Fatura /
-- e-Arşiv, arka planda iş = trackable job). Yeniden denemede ikinci bir satış faturası açılmasın diye Paraşüt'teki
-- satış faturası kimliği ve süren resmileştirme işinin kimliği satırda tutulur:
--   provider_ref  Paraşüt sales_invoices.id — bir kez yazılır, sonra değişmez (çift fatura koruması)
--   provider_job  Paraşüt trackable_jobs.id — süren resmileştirme; iş bitince / hata verince boşalır
-- İkisi de yalnız PROVIDER faturasında olabilir; işin olması için satış faturası kimliği olmalı.
-- =============================================================================

begin;

alter table public.crm_invoices
  add column if not exists provider_ref text,
  add column if not exists provider_job text;

alter table public.crm_invoices drop constraint if exists crm_invoices_provider_refs_check;
alter table public.crm_invoices
  add constraint crm_invoices_provider_refs_check
    check (
      (mode = 'PROVIDER' or (provider_ref is null and provider_job is null))
      and (provider_job is null or provider_ref is not null)
      and (provider_ref is null or provider_ref ~ '^[A-Za-z0-9_-]{1,64}$')
      and (provider_job is null or provider_job ~ '^[A-Za-z0-9_-]{1,64}$')
    );

comment on column public.crm_invoices.provider_ref is
  'Sağlayıcıdaki satış faturası kimliği (Paraşüt sales_invoices.id). Bir kez yazılır; yeniden deneme yeni fatura açmaz.';
comment on column public.crm_invoices.provider_job is
  'Süren resmileştirme işi (Paraşüt trackable_jobs.id). İş bitince ya da hata verince boşalır.';

-- Koruma: önceki kurallar aynen + provider_ref bir kez yazıldıktan sonra değişmez / silinmez.
create or replace function public.crm_guard_invoice()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.crm_institutions c
     where c.institution_id = new.institution_id
       and c.address is not null
       and (c.tc_no is not null or c.tax_no is not null)
  ) then
    raise exception 'CRM_BILLING_REQUIRED' using hint = 'Adres ve TC Kimlik No ya da Vergi No olmadan fatura kaydedilemez.';
  end if;

  if new.payment_id is not null and not exists (
    select 1 from public.crm_payments p
     where p.id = new.payment_id and p.institution_id = new.institution_id
  ) then
    raise exception 'CRM_INVOICE_SALE_MISMATCH' using hint = 'Ödeme bu kuruma ait değil.';
  end if;

  if new.license_id is not null and not exists (
    select 1 from public.crm_licenses l
     where l.id = new.license_id and l.institution_id = new.institution_id
  ) then
    raise exception 'CRM_INVOICE_SALE_MISMATCH' using hint = 'Lisans bu kuruma ait değil.';
  end if;

  -- Kimlik alanları oluştuktan sonra değişmez (satış referansı, kurum, tutar): yalnız durum / numara / hata / deneme.
  -- Sağlayıcıdaki satış faturası kimliği de bir kez yazılınca sabittir (aynı satış için ikinci platform faturası olmaz).
  if tg_op = 'UPDATE' and (
    new.institution_id <> old.institution_id
    or new.payment_id is distinct from old.payment_id
    or new.license_id is distinct from old.license_id
    or new.amount <> old.amount
    or new.net_amount <> old.net_amount
    or new.vat_amount <> old.vat_amount
    or new.idempotency_key <> old.idempotency_key
    or new.mode <> old.mode
    or (old.provider_ref is not null and new.provider_ref is distinct from old.provider_ref)
  ) then
    raise exception 'CRM_INVOICE_IMMUTABLE' using hint = 'Fatura kaydının satış ve tutar alanları değiştirilemez.';
  end if;

  return new;
end;
$$;

revoke execute on function public.crm_guard_invoice() from public, anon, authenticated;

commit;

-- =============================================================================
-- GERİ ALMA (gerekirse elle):
--   begin;
--   alter table public.crm_invoices drop constraint if exists crm_invoices_provider_refs_check;
--   alter table public.crm_invoices drop column if exists provider_job, drop column if exists provider_ref;
--   -- crm_guard_invoice: 20260929200000_crm_invoices.sql'deki sürümü yeniden çalıştırın (create or replace).
--   commit;
-- =============================================================================
