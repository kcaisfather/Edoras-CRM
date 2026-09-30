-- =============================================================================
-- EdorasCRM · 20260929220000 — Maliyetler: maliyet defteri, bütçeler, ayarlar
--
-- NEREYE: EdorasCRM'in KENDİ Supabase projesine (orishbqniebbgdanazrp). Edoras'ın canlı veritabanına bu
-- dosyadan hiçbir şey gitmez.
--
-- NEDEN: DeepSportAdmin'in Maliyetler modülü bir AWS maliyet servisine (Cost Explorer / CUR, Kubernetes
-- microservice ve kullanıcı atfı) dayanır. Edoras Supabase, Vercel, SMS (MutluCell), OpenAI ve Resend üstünde
-- çalışır; böyle bir maliyet API'si yok. Bu yüzden maliyet DEFTERİ CRM'in kendi tablosudur: aylık satırlar elle
-- girilir ya da CSV ile içe aktarılır. Uyarılar tabloda durmaz — okuma anında hesaplanır (zamanlayıcı yok).
--
-- NE EKLER:
--  1) crm_cost_entries  — aylık maliyet satırı (hizmet, ay, tutar, para birimi, kur → TL karşılığı).
--     Aynı hizmet ve ay için BİRDEN ÇOK satır serbest (bir fatura çoğu zaman birkaç kalemdir: plan + ek kullanım);
--     benzersizlik kısıtı yok. Aynı CSV'nin iki kez yüklenmesini sunucu önler (aynı hizmet + ay + tutar + para
--     birimi + not olan satır atlanır).
--  2) crm_cost_budgets  — aylık TL bütçe: GLOBAL (tüm hizmetler) ya da tek hizmet; yumuşak / sert eşik (%).
--     Kapsam başına en fazla bir AKTİF bütçe.
--  3) crm_cost_settings — tek satır: SMS birim fiyatı (TL / alıcı). Edoras sms_logs'tan "tahmini" SMS maliyeti bununla
--     hesaplanır; Edoras'a hiçbir şey yazılmaz.
--
-- KURALLAR (form + sunucu + burada üçü birlikte): tutar > 0; USD ise kur (TL / USD) zorunlu ve > 0, TL ise kur yok;
-- dönem ayın 1'i; TL karşılığı `amount_try` üretilmiş sütundur (kur × tutar, kuruşa yuvarlı) — istemci hesaplamaz.
--
-- GÜVENLİK: RLS açık, POLİTİKA YOK → yalnız service_role. Fonksiyonlar PUBLIC'ten geri alındı. Uçlar yalnız ADMIN.
--
-- Geri almak: dosyanın sonundaki "GERİ ALMA" bloğu.
--
-- UYGULANDI: 2026-09-30, CRM projesine Supabase MCP apply_migration ile (ad: crm_costs); dış
-- begin/commit çıkarılarak gönderildi.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1) Maliyet defteri
-- -----------------------------------------------------------------------------

create table if not exists public.crm_cost_entries (
  id uuid primary key default gen_random_uuid(),
  service text not null,
  period_month date not null,
  amount numeric(14, 2) not null,
  currency text not null,
  fx_rate numeric(12, 4),
  amount_try numeric(16, 2) generated always as (
    case when currency = 'TRY' then amount else round(amount * fx_rate, 2) end
  ) stored,
  note text,
  source text not null default 'MANUAL',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_cost_entries_service_check
    check (service in ('SUPABASE', 'VERCEL', 'SMS', 'OPENAI', 'RESEND', 'DOMAIN', 'OTHER')),
  constraint crm_cost_entries_period_check
    check (period_month = date_trunc('month', period_month)::date and period_month >= date '2020-01-01'),
  constraint crm_cost_entries_amount_check check (amount > 0 and amount < 1000000000),
  constraint crm_cost_entries_currency_check check (currency in ('USD', 'TRY')),
  constraint crm_cost_entries_fx_check
    check ((currency = 'USD' and fx_rate is not null and fx_rate > 0 and fx_rate < 10000)
        or (currency = 'TRY' and fx_rate is null)),
  constraint crm_cost_entries_note_check check (note is null or char_length(note) between 1 and 500),
  constraint crm_cost_entries_source_check check (source in ('MANUAL', 'IMPORT'))
);

create index if not exists crm_cost_entries_month_idx on public.crm_cost_entries (period_month desc, service);
create index if not exists crm_cost_entries_service_idx on public.crm_cost_entries (service, period_month desc);

create or replace function public.crm_cost_entries_normalize()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  new.note := nullif(btrim(new.note), '');
  return new;
end;
$$;

drop trigger if exists crm_cost_entries_normalize on public.crm_cost_entries;
create trigger crm_cost_entries_normalize
  before insert or update on public.crm_cost_entries
  for each row execute function public.crm_cost_entries_normalize();

drop trigger if exists crm_cost_entries_touch on public.crm_cost_entries;
create trigger crm_cost_entries_touch
  before update on public.crm_cost_entries
  for each row execute function public.crm_touch_updated_at();

-- -----------------------------------------------------------------------------
-- 2) Bütçeler
-- -----------------------------------------------------------------------------

create table if not exists public.crm_cost_budgets (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  service text,
  monthly_limit_try numeric(14, 2) not null,
  soft_pct integer not null default 80,
  hard_pct integer not null default 100,
  active boolean not null default true,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_cost_budgets_scope_check check (scope in ('GLOBAL', 'SERVICE')),
  constraint crm_cost_budgets_service_check
    check ((scope = 'GLOBAL' and service is null)
        or (scope = 'SERVICE' and service is not null and service in ('SUPABASE', 'VERCEL', 'SMS', 'OPENAI', 'RESEND', 'DOMAIN', 'OTHER'))),
  constraint crm_cost_budgets_limit_check check (monthly_limit_try > 0 and monthly_limit_try < 1000000000),
  constraint crm_cost_budgets_soft_check check (soft_pct between 1 and 100),
  constraint crm_cost_budgets_hard_check check (hard_pct between 1 and 200 and hard_pct > soft_pct),
  constraint crm_cost_budgets_note_check check (note is null or char_length(note) between 1 and 500)
);

-- Kapsam başına en fazla bir aktif bütçe (GLOBAL için hizmet boş; SERVICE için hizmet başına).
create unique index if not exists crm_cost_budgets_active_scope_key
  on public.crm_cost_budgets (scope, coalesce(service, ''))
  where active;

drop trigger if exists crm_cost_budgets_touch on public.crm_cost_budgets;
create trigger crm_cost_budgets_touch
  before update on public.crm_cost_budgets
  for each row execute function public.crm_touch_updated_at();

-- -----------------------------------------------------------------------------
-- 3) Ayarlar (tek satır)
-- -----------------------------------------------------------------------------

create table if not exists public.crm_cost_settings (
  id smallint primary key default 1,
  sms_unit_price_try numeric(10, 4) not null default 0,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint crm_cost_settings_singleton_check check (id = 1),
  constraint crm_cost_settings_sms_price_check check (sms_unit_price_try >= 0 and sms_unit_price_try < 1000)
);

insert into public.crm_cost_settings (id) values (1) on conflict (id) do nothing;

drop trigger if exists crm_cost_settings_touch on public.crm_cost_settings;
create trigger crm_cost_settings_touch
  before update on public.crm_cost_settings
  for each row execute function public.crm_touch_updated_at();

-- -----------------------------------------------------------------------------
-- 4) Yetkiler — yalnız service_role
-- -----------------------------------------------------------------------------

alter table public.crm_cost_entries enable row level security;
alter table public.crm_cost_budgets enable row level security;
alter table public.crm_cost_settings enable row level security;

revoke all on table public.crm_cost_entries, public.crm_cost_budgets, public.crm_cost_settings
  from public, anon, authenticated;
grant select, insert, update, delete on table public.crm_cost_entries, public.crm_cost_budgets to service_role;
grant select, update on table public.crm_cost_settings to service_role;

revoke execute on function public.crm_cost_entries_normalize() from public, anon, authenticated;

commit;

-- =============================================================================
-- GERİ ALMA (gerekirse elle; maliyet defteri, bütçeler ve ayar silinir):
--   begin;
--   drop table if exists public.crm_cost_entries, public.crm_cost_budgets, public.crm_cost_settings;
--   drop function if exists public.crm_cost_entries_normalize();
--   commit;
-- =============================================================================
