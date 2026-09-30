-- =============================================================================
-- EdorasCRM · 20260929200000 — Satış ve faturalar: fatura profili + crm_invoices
--
-- NEREYE: EdorasCRM'in KENDİ Supabase projesine (orishbqniebbgdanazrp). Edoras'ın canlı veritabanına
-- bu dosyadan hiçbir şey gitmez.
--
-- NE EKLER:
--  1) crm_institutions'a genişletilmiş fatura profili sütunları (DeepSport BillingProfile karşılığı): billing_type
--     INDIVIDUAL|COMPANY, legal_name, tax_office, billing_city, billing_district, postal_code, billing_email,
--     e_invoice_registered. Ayrı tablo yok: adres + TC/VKN zaten bu satırda.
--  2) crm_invoices — kesilen / e-postayla istenen / elle kaydedilen faturalar (madde 9 · INVOICES).
--  3) crm_guard_invoice — fatura ancak fatura bilgisi tam kuruma açılır (ödemeyle aynı kural).
--  4) crm_convert_to_paid yeniden yazılır (yalnız kimlik değişince profili tutarlı bırakan iki satır eklendi).
--
-- MEVCUT SATIRLAR GEÇERLİ KALIR — nedeni: yeni sütunların hepsi null olabilir ve her yeni kısıt "sütun null ise
-- geçerli" biçiminde yazıldı. Kimlik (TC/VKN) ve adresi olan eski satırlarda billing_type null kalır ("eski
-- kayıt"); ekran türü TC/VKN'den çıkarır, profil formu kaydedilince tür ve diğer alanlar yazılır. DEMO kurumlar
-- (adres/TC/VKN olmadan, ör. Bakırköy / Yeşilyurt) hiçbir yeni kuralı tetiklemez. Hiçbir satır güncellenmez,
-- geriye dönük doldurma (backfill) yoktur.
--
-- KURALLAR (form + sunucu + burada üçü birlikte):
--   * billing_type doluysa profil tamdır: unvan, il, ilçe, fatura e-postası, adres; INDIVIDUAL → TC (VKN yok),
--     COMPANY → VKN (TC yok) + vergi dairesi. Yani TC ⇔ INDIVIDUAL, VKN ⇔ COMPANY.
--   * Vergi dairesi yalnız VKN ile birlikte olur.
--   * Fatura, ancak adres + (TC veya VKN) kayıtlı kuruma açılır → CRM_BILLING_REQUIRED (crm_payments ile aynı).
--   * Fatura en az bir satış referansı taşır: ödeme (payment_id) ya da lisans (license_id).
--   * KDV dahil tutar = net + KDV (±0,01); KDV oranı 0–100.
--   * Aynı satış için ikinci fatura SERT ENGEL DEĞİL (DeepSport gibi uyarı: ekranda onay); tekrar istek
--     (aynı Idempotency-Key) ise idempotency_key benzersizliği ile tek satır olur.
--
-- GÜVENLİK: RLS açık, POLİTİKA YOK → yalnız service_role. Fonksiyon PUBLIC'ten geri alındı.
--
-- Geri almak: dosyanın sonundaki "GERİ ALMA" bloğu.
--
-- UYGULANDI: 2026-09-30, CRM projesine Supabase MCP apply_migration ile (ad: crm_invoices); dış
-- begin/commit çıkarılarak gönderildi.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1) Genişletilmiş fatura profili (hepsi null olabilir)
-- -----------------------------------------------------------------------------

alter table public.crm_institutions
  add column if not exists billing_type text,
  add column if not exists legal_name text,
  add column if not exists tax_office text,
  add column if not exists billing_city text,
  add column if not exists billing_district text,
  add column if not exists postal_code text,
  add column if not exists billing_email text,
  -- GİB e-Fatura mükellefi mi: yalnız sağlayıcı entegrasyonu doldurur (panel yazmaz); null = bilinmiyor.
  add column if not exists e_invoice_registered boolean;

alter table public.crm_institutions
  add constraint crm_institutions_billing_type_check
    check (billing_type is null or billing_type in ('INDIVIDUAL', 'COMPANY')),
  -- Doluysa anlamlı olsun (boşluk / tek harf değil).
  add constraint crm_institutions_billing_text_check
    check (
      (legal_name is null or length(btrim(legal_name)) >= 2)
      and (tax_office is null or length(btrim(tax_office)) >= 2)
      and (billing_city is null or length(btrim(billing_city)) >= 2)
      and (billing_district is null or length(btrim(billing_district)) >= 2)
      and length(coalesce(legal_name, '')) <= 200
      and length(coalesce(tax_office, '')) <= 100
      and length(coalesce(billing_city, '')) <= 100
      and length(coalesce(billing_district, '')) <= 100
    ),
  add constraint crm_institutions_postal_code_check
    check (postal_code is null or postal_code ~ '^[0-9]{5}$'),
  add constraint crm_institutions_billing_email_check
    check (billing_email is null or billing_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  -- Vergi dairesi yalnız VKN ile.
  add constraint crm_institutions_tax_office_vkn_check
    check (tax_office is null or tax_no is not null),
  -- TC ⇔ INDIVIDUAL, VKN ⇔ COMPANY ve tam profil (yalnız billing_type doluyken).
  add constraint crm_institutions_billing_profile_check
    check (
      billing_type is null
      or (
        legal_name is not null
        and billing_city is not null
        and billing_district is not null
        and billing_email is not null
        and address is not null
        and (
          (billing_type = 'INDIVIDUAL' and tc_no is not null and tax_no is null)
          or (billing_type = 'COMPANY' and tax_no is not null and tc_no is null and tax_office is not null)
        )
      )
    );

comment on column public.crm_institutions.billing_type is
  'INDIVIDUAL (TC) | COMPANY (VKN). null = eski kayıt (profil henüz tamamlanmadı; adres + TC/VKN yine geçerli).';
comment on column public.crm_institutions.e_invoice_registered is
  'GİB e-Fatura mükellefi mi. Yalnız sağlayıcı entegrasyonu doldurur; null = bilinmiyor.';

-- -----------------------------------------------------------------------------
-- 2) Demo → ücretli: kimlik değişince profil tutarlı kalsın. Önceki sürümle AYNI imza ve davranış; tek fark,
--    fatura formu (adres + TC/VKN) tür ve vergi dairesini bilmediği için billing_type null'a çekilir (eski kayıt
--    biçimi) ve TC ile kalan kurumda vergi dairesi temizlenir — aksi halde yukarıdaki kısıtlar reddederdi.
-- -----------------------------------------------------------------------------

create or replace function public.crm_convert_to_paid(
  p_institution_id uuid,
  p_address text,
  p_tc_no text,
  p_tax_no text,
  p_license_starts_on date,
  p_license_price numeric,
  p_payment_amount numeric,
  p_payment_method text,
  p_paid_on date,
  p_created_by uuid
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_status text;
  v_license_id uuid;
begin
  select c.status into v_status
    from public.crm_institutions c
   where c.institution_id = p_institution_id
   for update;

  if v_status is null then
    raise exception 'CRM_NOT_ENROLLED';
  end if;
  if v_status = 'UCRETLI' then
    raise exception 'CRM_ALREADY_PAID';
  end if;
  if p_license_starts_on is null or p_license_price is null then
    raise exception 'CRM_LICENSE_REQUIRED';
  end if;

  -- crm_institutions_paid_billing_check bu UPDATE'te devreye girer.
  update public.crm_institutions
     set status = 'UCRETLI',
         address = nullif(btrim(p_address), ''),
         tc_no = nullif(p_tc_no, ''),
         tax_no = nullif(p_tax_no, ''),
         billing_type = null,
         tax_office = case when nullif(p_tax_no, '') is null then null else tax_office end,
         converted_at = now()
   where institution_id = p_institution_id;

  insert into public.crm_licenses (institution_id, starts_on, ends_on, price, created_by)
  values (
    p_institution_id, p_license_starts_on, (p_license_starts_on + interval '1 year')::date,
    p_license_price, p_created_by
  )
  returning id into v_license_id;

  if p_payment_amount is not null then
    insert into public.crm_payments (institution_id, license_id, amount, paid_on, method, created_by)
    values (
      p_institution_id, v_license_id, p_payment_amount,
      coalesce(p_paid_on, public.crm_today()), p_payment_method, p_created_by
    );
  end if;

  return v_license_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3) Faturalar
-- -----------------------------------------------------------------------------

create table if not exists public.crm_invoices (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.crm_institutions(institution_id) on delete restrict,
  -- Satış referansı: ödeme (tahsilat) ve/veya lisans (satış). En az biri.
  payment_id uuid references public.crm_payments(id) on delete restrict,
  license_id uuid references public.crm_licenses(id) on delete restrict,
  -- Fatura anındaki müşteri adı (unvan ya da kurum adı): kurum sonradan değişse de belge aynı kalsın.
  customer_name text not null,
  -- PROVIDER: sağlayıcıda kesilir (Paraşüt…); EMAIL: talep muhasebeciye e-postalanır; MANUAL: başka yerde kesildi, kayıt.
  mode text not null,
  provider text,
  type text,
  recipient_emails text[] not null default '{}',
  -- KDV dahil toplam (TRY).
  amount numeric(12, 2) not null,
  net_amount numeric(12, 2) not null,
  vat_rate numeric(5, 2) not null,
  vat_amount numeric(12, 2) not null,
  currency text not null default 'TRY',
  description text not null,
  issue_date date not null,
  status text not null default 'PENDING',
  invoice_no text,
  pdf_url text,
  -- Kısa hata kodu (ör. "resend:422", "mail:not-configured"); sağlayıcı mesajı / alıcı adresi yazılmaz.
  error text,
  attempts integer not null default 0,
  idempotency_key text not null,
  note text,
  created_at timestamptz not null default now(),
  issued_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  constraint crm_invoices_idempotency_key_key unique (idempotency_key),
  constraint crm_invoices_sale_ref_check check (payment_id is not null or license_id is not null),
  constraint crm_invoices_mode_check check (mode in ('PROVIDER', 'EMAIL', 'MANUAL')),
  constraint crm_invoices_provider_check
    check ((mode = 'PROVIDER') = (provider is not null) and (provider is null or provider in ('PARASUT', 'LOGO', 'OTHER'))),
  constraint crm_invoices_type_check check (type is null or type in ('E_FATURA', 'E_ARSIV')),
  constraint crm_invoices_recipients_check
    check (
      (mode <> 'EMAIL' or cardinality(recipient_emails) >= 1)
      and cardinality(recipient_emails) <= 5
    ),
  constraint crm_invoices_amount_check check (amount > 0 and net_amount >= 0 and vat_amount >= 0),
  constraint crm_invoices_vat_rate_check check (vat_rate >= 0 and vat_rate <= 100),
  -- KDV dahil tutar = net + KDV (kuruş yuvarlaması payı: 0,01).
  constraint crm_invoices_vat_sum_check check (abs(net_amount + vat_amount - amount) <= 0.01),
  constraint crm_invoices_currency_check check (currency = 'TRY'),
  constraint crm_invoices_status_check check (status in ('PENDING', 'ISSUED', 'SENT', 'FAILED', 'CANCELLED')),
  -- Durum ↔ alanlar: kesilmiş faturanın numarası olur; gönderildi yalnız e-posta talebidir; başarısızda hata kodu vardır;
  -- elle kayıt daima numaralı ve kesilmiştir (iptal edilmiş olabilir).
  constraint crm_invoices_state_check
    check (
      (status <> 'ISSUED' or (invoice_no is not null and issued_at is not null))
      and (status <> 'SENT' or mode = 'EMAIL')
      and (status <> 'FAILED' or error is not null)
      and (mode <> 'MANUAL' or (status in ('ISSUED', 'CANCELLED') and invoice_no is not null))
    ),
  constraint crm_invoices_attempts_check check (attempts >= 0),
  constraint crm_invoices_text_check
    check (
      length(btrim(customer_name)) >= 2
      and length(btrim(description)) >= 2
      and length(description) <= 500
      and length(idempotency_key) between 8 and 200
      and (invoice_no is null or length(btrim(invoice_no)) between 1 and 64)
      and (note is null or length(note) <= 500)
      and (error is null or length(error) <= 200)
      and (pdf_url is null or pdf_url ~ '^https://')
    )
);

comment on table public.crm_invoices is
  'Faturalar: PROVIDER (Paraşüt vb., henüz bağlı değil), EMAIL (talep muhasebeciye e-postalanır), MANUAL (başka yerde kesildi, kayıt). Yalnız service_role.';

create index if not exists crm_invoices_institution_idx on public.crm_invoices (institution_id, created_at desc);
create index if not exists crm_invoices_payment_idx on public.crm_invoices (payment_id) where payment_id is not null;
create index if not exists crm_invoices_license_idx on public.crm_invoices (license_id) where license_id is not null;
create index if not exists crm_invoices_status_idx on public.crm_invoices (status, created_at desc);

-- Fatura ancak fatura bilgisi tam kuruma açılır (ödemeyle aynı kural); satış referansları o kuruma ait olmalı.
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
  if tg_op = 'UPDATE' and (
    new.institution_id <> old.institution_id
    or new.payment_id is distinct from old.payment_id
    or new.license_id is distinct from old.license_id
    or new.amount <> old.amount
    or new.net_amount <> old.net_amount
    or new.vat_amount <> old.vat_amount
    or new.idempotency_key <> old.idempotency_key
    or new.mode <> old.mode
  ) then
    raise exception 'CRM_INVOICE_IMMUTABLE' using hint = 'Fatura kaydının satış ve tutar alanları değiştirilemez.';
  end if;

  return new;
end;
$$;

drop trigger if exists crm_invoices_guard on public.crm_invoices;
create trigger crm_invoices_guard
  before insert or update on public.crm_invoices
  for each row execute function public.crm_guard_invoice();

-- -----------------------------------------------------------------------------
-- 4) Yetkiler
-- -----------------------------------------------------------------------------

alter table public.crm_invoices enable row level security;

revoke all on table public.crm_invoices from public, anon, authenticated;
grant select, insert, update, delete on table public.crm_invoices to service_role;

revoke execute on function public.crm_guard_invoice() from public, anon, authenticated;

commit;

-- =============================================================================
-- GERİ ALMA (gerekirse elle; fatura kayıtları silinir, profil sütunları düşer):
--   begin;
--   drop table if exists public.crm_invoices;
--   drop function if exists public.crm_guard_invoice();
--   alter table public.crm_institutions
--     drop constraint if exists crm_institutions_billing_profile_check,
--     drop constraint if exists crm_institutions_tax_office_vkn_check,
--     drop constraint if exists crm_institutions_billing_email_check,
--     drop constraint if exists crm_institutions_postal_code_check,
--     drop constraint if exists crm_institutions_billing_text_check,
--     drop constraint if exists crm_institutions_billing_type_check,
--     drop column if exists e_invoice_registered, drop column if exists billing_email,
--     drop column if exists postal_code, drop column if exists billing_district,
--     drop column if exists billing_city, drop column if exists tax_office,
--     drop column if exists legal_name, drop column if exists billing_type;
--   -- crm_convert_to_paid: 20260929120000_crm_core.sql'deki sürümü yeniden çalıştırın (create or replace).
--   commit;
-- =============================================================================
