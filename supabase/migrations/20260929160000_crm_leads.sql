-- =============================================================================
-- EdorasCRM · 20260929160000 — CRM adayları (crm_leads) ve notları (crm_notes)
--
-- NEREYE: EdorasCRM'in kendi Supabase projesi (orishbqniebbgdanazrp). Edoras'a dokunmaz.
--
-- DeepSportAdmin'in CRM lead sözleşmesinin (docs/backend-requests.md → Madde 4 CRM_OFFER_FIELDS,
-- CRM_FOLLOW_UP_FIELDS, CRM_LEAD_SOURCE, CRM_LEAD_USER_ID_FILTER) gerçek tablo karşılığı. DeepSport'ta
-- bayrak kapalıyken not önekiyle (`[TEKLIF|…]`, `[TAKIP|…]`, `[TAHSILAT|…]`) tutulan bilgi burada
-- gerçek kolondur:
--   * Aday = potansiyel ya da mevcut müşteri KURUM. `institution_id` Edoras institutions.id'sine
--     YUMUŞAK referanstır (başka veritabanı, FK yok); bir kuruma en fazla bir aday bağlanır
--     → crm_leads_institution_id_key (kısmi benzersiz dizin).
--   * Teklif / satış tutarı, kayıp nedeni, sonraki arama, teklif ve satış tarihi kolondur.
--   * Tahsilat ayrı tablo DEĞİLDİR: adayın tahsilatı bağlı kurumun crm_payments satırlarıdır
--     (ödeme kuralı — fatura bilgisi — crm_guard_payment'ta zaten zorunlu).
--   * Notlar crm_notes'ta; şikâyet (SIKAYET), devir (DEVIR), iletişim denemesi (ILETISIM) ve program
--     etiketi (PROGRAM) başka bir evleri olana kadar yapılandırılmış not önekiyle kalır
--     (lib/domain/crm-notes/utils.ts).
--   * created_by / updated_by / author_id sunucuda oturumdan yazılır; istek gövdesinden okunmaz.
--
-- KURALLAR (veritabanında da zorunlu; sunucu service_role ile bağlanır, RLS'i görmez):
--   * Statü DeepSport'un 8 değeri; kaynak MANUAL | EDORAS | IMPORT | COLD_LIST.
--   * Adayın en az kurum adı ya da yetkili adı olmalı → crm_leads_identity_check.
--   * Telefon E.164, e-posta biçimi (doluysa) → crm_leads_contact_phone/email_check.
--   * Tutarlar ≥ 0. Kayıp nedeni yalnız OLUMSUZ statüsünde; satış tarihi yalnız SATIS_OLDU'da.
--   * Boş metin null'a çevrilir, e-posta küçük harfe (crm_leads_normalize) — kimlik kuralı boşlukla aşılmaz.
--
-- GÜVENLİK: RLS açık, POLİTİKA YOK → yalnız service_role. Fonksiyonlar PUBLIC'ten geri alındı.
-- Geri almak: dosyanın sonundaki "GERİ ALMA" bloğu.
--
-- UYGULANDI: 2026-09-29, CRM projesine Supabase MCP apply_migration ile (ad: crm_leads); dış
-- begin/commit çıkarılarak gönderildi.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1) Adaylar
-- -----------------------------------------------------------------------------

create table if not exists public.crm_leads (
  id uuid primary key default gen_random_uuid(),
  organization_name text,
  contact_first_name text,
  contact_last_name text,
  contact_email text,
  contact_phone text,
  city text,
  district text,
  country text,
  status text not null default 'ARANACAK',
  source text not null default 'MANUAL',
  offer_amount numeric(12, 2),
  sale_amount numeric(12, 2),
  lost_reason text,
  -- Takvim günleri (Europe/Istanbul): sonraki arama, teklifin verildiği ve satışın olduğu gün.
  next_follow_up_at date,
  offer_sent_at date,
  sold_at date,
  -- Edoras (bmjkpxbrmwxuildwakly) public.institutions.id — başka veritabanı, FK yok.
  institution_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_leads_status_check check (status in (
    'ARANACAK', 'ULASILAMADI', 'RANDEVU_PLANLANDI', 'DEMO_TANIMLANDI',
    'TEKLIF_VERILDI', 'SATIS_OLDU', 'OLUMSUZ', 'TAKIPTE'
  )),
  constraint crm_leads_source_check check (source in ('MANUAL', 'EDORAS', 'IMPORT', 'COLD_LIST')),
  -- Kimsesiz kayıt olmaz: kurum adı ya da yetkilinin adı/soyadı.
  constraint crm_leads_identity_check check (
    organization_name is not null or contact_first_name is not null or contact_last_name is not null
  ),
  constraint crm_leads_contact_phone_check check (contact_phone is null or contact_phone ~ '^\+[1-9][0-9]{7,14}$'),
  constraint crm_leads_contact_email_check check (contact_email is null or contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint crm_leads_offer_amount_check check (offer_amount is null or offer_amount >= 0),
  constraint crm_leads_sale_amount_check check (sale_amount is null or sale_amount >= 0),
  constraint crm_leads_lost_reason_check check (
    lost_reason is null
    or (status = 'OLUMSUZ' and lost_reason in ('FIYAT', 'ZAMANLAMA', 'RAKIP', 'IHTIYAC_YOK', 'BUTCE', 'DIGER'))
  ),
  constraint crm_leads_sold_at_check check (sold_at is null or status = 'SATIS_OLDU'),
  constraint crm_leads_length_check check (
    coalesce(length(organization_name), 0) <= 200
    and coalesce(length(contact_first_name), 0) <= 100
    and coalesce(length(contact_last_name), 0) <= 100
    and coalesce(length(contact_email), 0) <= 254
    and coalesce(length(city), 0) <= 100
    and coalesce(length(district), 0) <= 100
    and coalesce(length(country), 0) <= 100
  )
);

comment on table public.crm_leads is
  'EdorasCRM adayları (potansiyel ya da mevcut müşteri kurum). Yalnız service_role.';
comment on column public.crm_leads.institution_id is
  'Edoras (bmjkpxbrmwxuildwakly) public.institutions.id — başka veritabanı, FK yok. Kurum başına en fazla bir aday.';

create unique index if not exists crm_leads_institution_id_key
  on public.crm_leads (institution_id) where institution_id is not null;
create index if not exists crm_leads_created_idx on public.crm_leads (created_at desc);

-- Boş metin → null, fazla boşluk tekilleşir, e-posta küçük harf. CHECK'ler bu düzeltmeden SONRA
-- değerlendirilir: "   " kurum adıyla kimlik kuralı aşılamaz.
create or replace function public.crm_leads_normalize()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  new.organization_name := nullif(btrim(regexp_replace(new.organization_name, '\s+', ' ', 'g')), '');
  new.contact_first_name := nullif(btrim(regexp_replace(new.contact_first_name, '\s+', ' ', 'g')), '');
  new.contact_last_name := nullif(btrim(regexp_replace(new.contact_last_name, '\s+', ' ', 'g')), '');
  new.contact_email := lower(nullif(btrim(new.contact_email), ''));
  new.contact_phone := nullif(btrim(new.contact_phone), '');
  new.city := nullif(btrim(new.city), '');
  new.district := nullif(btrim(new.district), '');
  new.country := nullif(btrim(new.country), '');
  return new;
end;
$$;

drop trigger if exists crm_leads_normalize on public.crm_leads;
create trigger crm_leads_normalize
  before insert or update on public.crm_leads
  for each row execute function public.crm_leads_normalize();

-- updated_at: çekirdekteki ortak dokunma fonksiyonu (20260929120000_crm_core).
drop trigger if exists crm_leads_touch on public.crm_leads;
create trigger crm_leads_touch
  before update on public.crm_leads
  for each row execute function public.crm_touch_updated_at();

-- -----------------------------------------------------------------------------
-- 2) Aday notları — aday silinince notları da silinir.
-- -----------------------------------------------------------------------------

create table if not exists public.crm_notes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.crm_leads(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  -- Yazıldığı andaki ad (personel sonradan çıkarılsa da not sahipsiz kalmasın).
  author_name text,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_notes_content_check check (length(btrim(content)) between 1 and 5000)
);

create index if not exists crm_notes_lead_idx on public.crm_notes (lead_id, created_at desc);

drop trigger if exists crm_notes_touch on public.crm_notes;
create trigger crm_notes_touch
  before update on public.crm_notes
  for each row execute function public.crm_touch_updated_at();

-- -----------------------------------------------------------------------------
-- 3) Yetkiler — yalnız service_role
-- -----------------------------------------------------------------------------

alter table public.crm_leads enable row level security;
alter table public.crm_notes enable row level security;

revoke all on table public.crm_leads, public.crm_notes from public, anon, authenticated;
grant select, insert, update, delete on table public.crm_leads, public.crm_notes to service_role;

revoke execute on function public.crm_leads_normalize() from public, anon, authenticated;

commit;

-- =============================================================================
-- GERİ ALMA (adaylar ve notları silinir; kurum, lisans ve ödemeler etkilenmez):
--   begin;
--   drop table if exists public.crm_notes, public.crm_leads;
--   drop function if exists public.crm_leads_normalize();
--   commit;
-- =============================================================================
