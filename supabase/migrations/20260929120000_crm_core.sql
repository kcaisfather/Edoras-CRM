-- =============================================================================
-- EdorasCRM · 20260929120000 — CRM çekirdeği: personel, kurum kaydı, lisans, ödeme
--
-- NEREYE: EdorasCRM'in KENDİ Supabase projesine (orishbqniebbgdanazrp). Edoras'ın canlı veritabanına
-- (bmjkpxbrmwxuildwakly — edoras-admin + mobil) bu dosyadan HİÇBİR ŞEY gitmez; Edoras şeması değişmez.
-- CRM sunucusu Edoras'a ayrıca bağlanır: kurum listesi, kullanım sayıları ve demo açarken kurum +
-- kurum yöneticisi oluşturma (lib/server/edoras.ts). O yüzden buradaki institution_id, Edoras
-- institutions.id'sine YUMUŞAK referanstır (iki veritabanı arasında FK kurulamaz).
--
-- UYGULANDI: 2026-09-29, CRM projesine Supabase MCP apply_migration ile (ad: crm_core). MCP dış
-- begin/commit'i kendisi sağladığı için o iki satır çıkarılarak gönderildi.
--
-- KURALLAR (kurucu kararı, 2026-09-29) — veritabanında da zorunlu, çünkü sunucu service_role ile
-- bağlanır ve RLS'i hiç görmez; kural yalnız formda olsaydı tek bir hatalı istek onu aşardı:
--   * Müşteri birimi KURUM (Edoras institutions).
--   * 1 dönem = 1 yıl. Ücretli lisans 1 dönemdir → crm_licenses_one_year_check.
--   * Demo da 1 dönemdir (1 yıl) ve "DEMO" etiketi taşır → crm_institutions_demo_dates_check.
--     Yetkili ad soyad + kurum adı + telefon + e-posta olmadan demo açılamaz
--     → crm_institutions_contact_*_check + institution_name (satır ancak bunlarla oluşur).
--   * Demo süresi dolunca kurum PASİFE DÜŞMEZ; yalnız ekranda "süresi doldu" gösterilir. Hiçbir iş
--     Edoras'taki institutions.is_active'e dokunmaz. Demo uzatılmaz: süre sabit 1 yıl.
--   * Adres + (TC Kimlik No VEYA Vergi No) olmadan ücretli hesap açılamaz
--     → crm_institutions_paid_billing_check, ödeme alınamaz → crm_payments tetikleyicisi.
--
-- GÜVENLİK: bütün tablolarda RLS açık ve POLİTİKA YOK → yalnız service_role (BYPASSRLS).
-- Fonksiyonlar PUBLIC'ten geri alındı, yalnız service_role'e verildi.
--
-- İLK YÖNETİCİ: bu projenin Auth'unda kullanıcı açıldıktan sonra (Dashboard → Authentication →
-- Add user ya da `node scripts/add-staff.mjs`):
--   insert into public.crm_staff (user_id, role, full_name)
--   select id, 'ADMIN', 'Ad Soyad' from auth.users where email = 'ornek@edorasapp.ai';
--
-- Geri almak: dosyanın sonundaki "GERİ ALMA" bloğu.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1) Saf doğrulayıcılar (CHECK kısıtlarında kullanılır; lib/domain/institutions/rules.ts ile aynı)
-- -----------------------------------------------------------------------------

-- TC Kimlik No: 11 hane, ilk hane 0 değil;
--   10. hane = ((1+3+5+7+9. haneler) * 7 − (2+4+6+8. haneler)) mod 10
--   11. hane = (ilk 10 hanenin toplamı) mod 10
create or replace function public.crm_is_valid_tckn(p text)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog, pg_temp
as $$
declare
  d int[] := array[]::int[];
  i int;
  odd_sum int;
  even_sum int;
  total int := 0;
begin
  if p is null or p !~ '^[1-9][0-9]{10}$' then
    return false;
  end if;
  for i in 1..11 loop
    d := d || substr(p, i, 1)::int;
  end loop;
  odd_sum := d[1] + d[3] + d[5] + d[7] + d[9];
  even_sum := d[2] + d[4] + d[6] + d[8];
  if (((odd_sum * 7 - even_sum) % 10) + 10) % 10 <> d[10] then
    return false;
  end if;
  for i in 1..10 loop
    total := total + d[i];
  end loop;
  return total % 10 = d[11];
end;
$$;

-- Vergi Kimlik No (GİB algoritması): 10 hane; ilk 9 hanenin her biri için
--   t = (hane + 9 − i) mod 10   (i = 0..8, soldan)
--   v = t = 9 ? 9 : (t * 2^(9 − i)) mod 9
--   kontrol hanesi = (10 − (Σv mod 10)) mod 10
create or replace function public.crm_is_valid_vkn(p text)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog, pg_temp
as $$
declare
  i int;
  t int;
  v int;
  total int := 0;
begin
  if p is null or p !~ '^[0-9]{10}$' then
    return false;
  end if;
  for i in 0..8 loop
    t := (substr(p, i + 1, 1)::int + 9 - i) % 10;
    if t = 9 then
      v := 9;
    else
      v := (t * power(2, 9 - i)::int) % 9;
    end if;
    total := total + v;
  end loop;
  return (10 - (total % 10)) % 10 = substr(p, 10, 1)::int;
end;
$$;

-- Türkiye takvim günü (Supabase UTC çalışır; gece 00:00–03:00 arası "bugün" kaymasın).
create or replace function public.crm_today()
returns date
language sql
stable
set search_path = pg_catalog, pg_temp
as $$
  select (now() at time zone 'Europe/Istanbul')::date;
$$;

-- -----------------------------------------------------------------------------
-- 2) CRM personeli — EdorasCRM'e kim girer (bu projenin Auth kullanıcıları). Rol: ADMIN (her şey) /
--    CRM_AGENT (tutar görmez, ücretliye geçiremez, ödeme kaydedemez).
-- -----------------------------------------------------------------------------

create table if not exists public.crm_staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'CRM_AGENT' check (role in ('ADMIN', 'CRM_AGENT')),
  full_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.crm_staff is
  'EdorasCRM erişimi. Satırı olmayan (ya da is_active=false) kullanıcı CRM''e giremez.';

-- -----------------------------------------------------------------------------
-- 3) Kurumun CRM kaydı (kurum başına tek satır). institution_id = Edoras institutions.id.
-- -----------------------------------------------------------------------------

create table if not exists public.crm_institutions (
  institution_id uuid primary key,
  -- Kayıt anındaki kurum adı: Edoras'taki kurum silinse de mali kayıt adsız kalmasın.
  institution_name text not null check (length(btrim(institution_name)) >= 2),
  status text not null check (status in ('DEMO', 'UCRETLI')),
  contact_name text not null,
  contact_phone text not null,
  contact_email text not null,
  address text,
  tc_no text,
  tax_no text,
  demo_started_at date,
  demo_ends_at date,
  converted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Demo kuralı: ad soyad (en az iki kelime) + telefon (E.164) + e-posta.
  constraint crm_institutions_contact_name_check
    check (btrim(contact_name) ~ '^\S+(\s+\S+)+$'),
  constraint crm_institutions_contact_phone_check
    check (contact_phone ~ '^\+[1-9][0-9]{7,14}$'),
  constraint crm_institutions_contact_email_check
    check (contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  -- Kimlik alanları boş olabilir, doluysa geçerli olmalı.
  constraint crm_institutions_tc_no_check
    check (tc_no is null or public.crm_is_valid_tckn(tc_no)),
  constraint crm_institutions_tax_no_check
    check (tax_no is null or public.crm_is_valid_vkn(tax_no)),
  constraint crm_institutions_address_check
    check (address is null or length(btrim(address)) >= 10),
  -- Demo kuralı: 1 dönem = 1 yıl. Aralık [başlangıç, bitiş): bitiş günü demo bitmiştir.
  -- (Ücretliye geçen kurumda demo tarihleri geçmiş olarak kalır; kısıt yalnız DEMO satırına bakar.)
  constraint crm_institutions_demo_dates_check
    check (status <> 'DEMO' or (demo_started_at is not null
                                and demo_ends_at = (demo_started_at + interval '1 year')::date)),
  -- Ücretli kuralı: adres + (TC veya Vergi No).
  constraint crm_institutions_paid_billing_check
    check (status <> 'UCRETLI' or (address is not null and (tc_no is not null or tax_no is not null)))
);

comment on table public.crm_institutions is
  'EdorasCRM kurum kaydı: DEMO / UCRETLI etiketi, yetkili iletişim ve fatura bilgisi. Yalnız service_role.';
comment on column public.crm_institutions.institution_id is
  'Edoras (bmjkpxbrmwxuildwakly) public.institutions.id — başka veritabanı, FK yok.';

create or replace function public.crm_touch_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists crm_institutions_touch on public.crm_institutions;
create trigger crm_institutions_touch
  before update on public.crm_institutions
  for each row execute function public.crm_touch_updated_at();

-- -----------------------------------------------------------------------------
-- 4) Lisanslar — 1 dönem = 1 yıl. Aralık [starts_on, ends_on): ends_on günü lisans bitmiştir,
--    yenileme tam o gün başlar (çakışma yok, boşluk yok).
-- -----------------------------------------------------------------------------

create table if not exists public.crm_licenses (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.crm_institutions(institution_id) on delete restrict,
  starts_on date not null,
  ends_on date not null,
  price numeric(12, 2) not null check (price >= 0),
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint crm_licenses_one_year_check check (ends_on = (starts_on + interval '1 year')::date)
);

create index if not exists crm_licenses_institution_idx
  on public.crm_licenses (institution_id, ends_on desc);

create or replace function public.crm_guard_license()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Lisans yalnız ücretli kuruma verilir (ücretli olmak zaten adres + TC/VKN demektir).
  if not exists (
    select 1 from public.crm_institutions c
     where c.institution_id = new.institution_id and c.status = 'UCRETLI'
  ) then
    raise exception 'CRM_NOT_PAID' using hint = 'Lisans yalnız ücretli kuruma verilir.';
  end if;

  if exists (
    select 1 from public.crm_licenses l
     where l.institution_id = new.institution_id
       and l.id <> new.id
       and daterange(l.starts_on, l.ends_on, '[)') && daterange(new.starts_on, new.ends_on, '[)')
  ) then
    raise exception 'CRM_LICENSE_OVERLAP' using hint = 'Bu tarihlerde kurumun başka bir lisansı var.';
  end if;

  return new;
end;
$$;

drop trigger if exists crm_licenses_guard on public.crm_licenses;
create trigger crm_licenses_guard
  before insert or update on public.crm_licenses
  for each row execute function public.crm_guard_license();

-- -----------------------------------------------------------------------------
-- 5) Ödemeler — adres + TC/VKN olmadan ödeme kaydı açılamaz.
-- -----------------------------------------------------------------------------

create table if not exists public.crm_payments (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.crm_institutions(institution_id) on delete restrict,
  license_id uuid references public.crm_licenses(id) on delete set null,
  amount numeric(12, 2) not null check (amount > 0),
  paid_on date not null,
  method text not null check (method in ('HAVALE', 'KREDI_KARTI', 'NAKIT', 'DIGER')),
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists crm_payments_institution_idx
  on public.crm_payments (institution_id, paid_on desc);

create or replace function public.crm_guard_payment()
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
    raise exception 'CRM_BILLING_REQUIRED' using hint = 'Adres ve TC Kimlik No ya da Vergi No olmadan ödeme alınamaz.';
  end if;

  if new.license_id is not null and not exists (
    select 1 from public.crm_licenses l
     where l.id = new.license_id and l.institution_id = new.institution_id
  ) then
    raise exception 'CRM_LICENSE_MISMATCH' using hint = 'Lisans bu kuruma ait değil.';
  end if;

  return new;
end;
$$;

drop trigger if exists crm_payments_guard on public.crm_payments;
create trigger crm_payments_guard
  before insert or update on public.crm_payments
  for each row execute function public.crm_guard_payment();

-- -----------------------------------------------------------------------------
-- 6) İşlemler — her biri tek transaction. Çağıran: EdorasCRM sunucusu (service_role).
--    Kurumun Edoras'ta var olduğunu sunucu denetler (başka veritabanı).
-- -----------------------------------------------------------------------------

-- Kurumu CRM'e kaydeder: DEMO (demonun başlangıcı; bitiş +1 yıl) ya da UCRETLI (fatura + süren
-- lisansın başlangıcı ve bedeli). Yeni demo açarken de bu çağrılır (başlangıç = bugün).
create or replace function public.crm_enroll_institution(
  p_institution_id uuid,
  p_institution_name text,
  p_status text,
  p_contact_name text,
  p_contact_phone text,
  p_contact_email text,
  p_address text,
  p_tc_no text,
  p_tax_no text,
  p_demo_starts_on date,
  p_license_starts_on date,
  p_license_price numeric,
  p_created_by uuid
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if exists (select 1 from public.crm_institutions c where c.institution_id = p_institution_id) then
    raise exception 'CRM_ALREADY_ENROLLED';
  end if;

  if p_status = 'DEMO' then
    if p_demo_starts_on is null then
      raise exception 'CRM_DEMO_START_REQUIRED';
    end if;
    insert into public.crm_institutions (
      institution_id, institution_name, status, contact_name, contact_phone, contact_email,
      address, tc_no, tax_no, demo_started_at, demo_ends_at, created_by
    )
    values (
      p_institution_id, btrim(p_institution_name), 'DEMO', btrim(p_contact_name), p_contact_phone,
      lower(btrim(p_contact_email)), nullif(btrim(p_address), ''), nullif(p_tc_no, ''), nullif(p_tax_no, ''),
      p_demo_starts_on, (p_demo_starts_on + interval '1 year')::date, p_created_by
    );
  elsif p_status = 'UCRETLI' then
    if p_license_starts_on is null or p_license_price is null then
      raise exception 'CRM_LICENSE_REQUIRED';
    end if;
    insert into public.crm_institutions (
      institution_id, institution_name, status, contact_name, contact_phone, contact_email,
      address, tc_no, tax_no, converted_at, created_by
    )
    values (
      p_institution_id, btrim(p_institution_name), 'UCRETLI', btrim(p_contact_name), p_contact_phone,
      lower(btrim(p_contact_email)), nullif(btrim(p_address), ''), nullif(p_tc_no, ''), nullif(p_tax_no, ''),
      now(), p_created_by
    );
    insert into public.crm_licenses (institution_id, starts_on, ends_on, price, created_by)
    values (
      p_institution_id, p_license_starts_on, (p_license_starts_on + interval '1 year')::date,
      p_license_price, p_created_by
    );
  else
    raise exception 'CRM_STATUS_INVALID';
  end if;
end;
$$;

-- Demo → ücretli: fatura bilgisi + ilk lisans (+ isteğe bağlı ilk ödeme) tek seferde.
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

-- Lisans yenile: süren lisansın bitişinden (bitmişse bugünden) başlayan yeni 1 yıl.
create or replace function public.crm_renew_license(
  p_institution_id uuid,
  p_price numeric,
  p_created_by uuid
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_today date := public.crm_today();
  v_last_end date;
  v_start date;
  v_license_id uuid;
begin
  perform 1 from public.crm_institutions c where c.institution_id = p_institution_id for update;
  if not found then
    raise exception 'CRM_NOT_ENROLLED';
  end if;

  select max(l.ends_on) into v_last_end from public.crm_licenses l where l.institution_id = p_institution_id;
  v_start := greatest(coalesce(v_last_end, v_today), v_today);

  insert into public.crm_licenses (institution_id, starts_on, ends_on, price, created_by)
  values (p_institution_id, v_start, (v_start + interval '1 year')::date, p_price, p_created_by)
  returning id into v_license_id;

  return v_license_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7) Yetkiler — tablolar ve fonksiyonlar yalnız service_role
-- -----------------------------------------------------------------------------

alter table public.crm_staff enable row level security;
alter table public.crm_institutions enable row level security;
alter table public.crm_licenses enable row level security;
alter table public.crm_payments enable row level security;

revoke all on table public.crm_staff, public.crm_institutions, public.crm_licenses, public.crm_payments
  from public, anon, authenticated;
grant select, insert, update, delete
  on table public.crm_staff, public.crm_institutions, public.crm_licenses, public.crm_payments
  to service_role;

revoke execute on function
  public.crm_is_valid_tckn(text),
  public.crm_is_valid_vkn(text),
  public.crm_today(),
  public.crm_touch_updated_at(),
  public.crm_guard_license(),
  public.crm_guard_payment(),
  public.crm_enroll_institution(uuid, text, text, text, text, text, text, text, text, date, date, numeric, uuid),
  public.crm_convert_to_paid(uuid, text, text, text, date, numeric, numeric, text, date, uuid),
  public.crm_renew_license(uuid, numeric, uuid)
  from public, anon, authenticated;

grant execute on function
  public.crm_is_valid_tckn(text),
  public.crm_is_valid_vkn(text),
  public.crm_today(),
  public.crm_enroll_institution(uuid, text, text, text, text, text, text, text, text, date, date, numeric, uuid),
  public.crm_convert_to_paid(uuid, text, text, text, date, numeric, numeric, text, date, uuid),
  public.crm_renew_license(uuid, numeric, uuid)
  to service_role;

commit;

-- =============================================================================
-- GERİ ALMA (gerekirse elle; ödeme/lisans kayıtları da silinir):
--   begin;
--   drop function if exists public.crm_renew_license(uuid, numeric, uuid);
--   drop function if exists public.crm_convert_to_paid(uuid, text, text, text, date, numeric, numeric, text, date, uuid);
--   drop function if exists public.crm_enroll_institution(uuid, text, text, text, text, text, text, text, text, date, date, numeric, uuid);
--   drop table if exists public.crm_payments, public.crm_licenses, public.crm_institutions, public.crm_staff;
--   drop function if exists public.crm_guard_payment(), public.crm_guard_license(),
--     public.crm_touch_updated_at(), public.crm_today(),
--     public.crm_is_valid_vkn(text), public.crm_is_valid_tckn(text);
--   commit;
--   (Edoras tarafı etkilenmez: CRM'in açtığı demo kurumlar edoras-admin'de kalır.)
-- =============================================================================
