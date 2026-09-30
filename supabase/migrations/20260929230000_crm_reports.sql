-- =============================================================================
-- EdorasCRM · 20260929230000 — Raporlar: zamanlanmış rapor e-postaları
--
-- NEREYE: EdorasCRM'in KENDİ Supabase projesine (orishbqniebbgdanazrp). Edoras'ın canlı veritabanına bu
-- dosyadan hiçbir şey gitmez.
--
-- NEDEN: DeepSportAdmin'in Raporlar ekranı (Madde 10 · REPORTS) zamanlanmış e-posta raporunu backend'e bırakır
-- (report_subscriptions + report-dispatcher + SES). EdorasCRM'de karşılığı: abonelik tablosu + Resend
-- (lib/server/mail.ts) + POST /api/cron/reports dağıtıcısı (dışarıdan tetiklenir; zamanlayıcı altyapısı yoktur).
--
-- NE EKLER:
--  1) crm_report_subscriptions — abonelik: alıcılar, sıklık, saat, gün, bölümler, zaman dilimi, sonraki çalışma.
--     Alıcılar YALNIZ CRM personelidir (recipient_ids = crm_staff.user_id); serbest e-posta adresi yoktur, böylece
--     rapor verisi ekip dışına çıkamaz. E-posta adresi gönderim anında Auth'tan çözülür. Yazılan her alıcı
--     AKTİF CRM personeli olmalı (tetikleyici); sonradan kapatılan kişiye gönderimde atlanır.
--  2) crm_report_runs — gönderim kaydı (abonelik başına; alıcı adresi tutulmaz, yalnız sayı ve kısa hata kodu).
--
-- KURALLAR (form + sunucu + burada üçü birlikte): saat 'HH:MM'; haftalıkta gün 1–7 (ISO, 1 = Pazartesi), aylıkta
-- ayın günü 1–28, diğer sıklıkta ilgili alan boş; bölümler altı değerden biri ve en az bir tane; alıcı 1–50 kişi;
-- zaman dilimi Europe/Istanbul.
--
-- GÜVENLİK: RLS açık, POLİTİKA YOK → yalnız service_role. Uçlar yalnız ADMIN (dağıtıcı ayrıca CRON_SECRET ister).
--
-- Geri almak: dosyanın sonundaki "GERİ ALMA" bloğu.
--
-- UYGULANDI: 2026-09-30, CRM projesine Supabase MCP apply_migration ile (ad: crm_reports); dış
-- begin/commit çıkarılarak gönderildi.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1) Abonelikler
-- -----------------------------------------------------------------------------

create table if not exists public.crm_report_subscriptions (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Zamanlanmış rapor',
  recipient_ids uuid[] not null,
  frequency text not null,
  time text not null default '08:30',
  weekday smallint,
  day_of_month smallint,
  sections text[] not null,
  timezone text not null default 'Europe/Istanbul',
  active boolean not null default true,
  last_sent_at timestamptz,
  next_run_at timestamptz not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_report_subscriptions_name_check check (char_length(name) between 1 and 100),
  constraint crm_report_subscriptions_recipients_check
    check (cardinality(recipient_ids) between 1 and 50 and array_position(recipient_ids, null) is null),
  constraint crm_report_subscriptions_frequency_check check (frequency in ('DAILY', 'WEEKLY', 'MONTHLY')),
  constraint crm_report_subscriptions_time_check check (time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  constraint crm_report_subscriptions_weekday_check
    check ((frequency = 'WEEKLY') = (weekday is not null) and (weekday is null or weekday between 1 and 7)),
  constraint crm_report_subscriptions_day_check
    check ((frequency = 'MONTHLY') = (day_of_month is not null) and (day_of_month is null or day_of_month between 1 and 28)),
  constraint crm_report_subscriptions_sections_check
    check (
      cardinality(sections) between 1 and 6
      and array_position(sections, null) is null
      and sections <@ array['todayTasks', 'endingDemos', 'expiring60', 'openOffers', 'newSignups', 'salesTotal']::text[]
    ),
  constraint crm_report_subscriptions_timezone_check check (timezone = 'Europe/Istanbul')
);

-- Dağıtıcı: "çalışma zamanı gelmiş aktif abonelikler".
create index if not exists crm_report_subscriptions_due_idx
  on public.crm_report_subscriptions (next_run_at) where active;

-- Alıcılar: tekrarsız ve AKTİF CRM personeli (yalnız alıcı listesi değişirken denetlenir; sonradan kapatılan
-- kişi yüzünden dağıtıcının next_run_at / last_sent_at güncellemesi bloklanmasın).
create or replace function public.crm_report_subscriptions_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.name := btrim(new.name);
  -- Sayı ve boş (null) denetimi CHECK'te; tetikleyici CHECK'ten önce çalıştığı için uygunsuz listeyi ona bırakır.
  if (tg_op = 'INSERT' or new.recipient_ids is distinct from old.recipient_ids)
     and cardinality(new.recipient_ids) between 1 and 50
     and array_position(new.recipient_ids, null) is null then
    if (select count(distinct r) from unnest(new.recipient_ids) r) <> cardinality(new.recipient_ids) then
      raise exception 'CRM_REPORT_RECIPIENT_INVALID' using hint = 'Alıcı listesinde tekrar var.';
    end if;
    if exists (
      select 1 from unnest(new.recipient_ids) r
       where not exists (select 1 from public.crm_staff s where s.user_id = r and s.is_active)
    ) then
      raise exception 'CRM_REPORT_RECIPIENT_INVALID' using hint = 'Alıcılar yalnız aktif CRM personeli olabilir.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists crm_report_subscriptions_guard on public.crm_report_subscriptions;
create trigger crm_report_subscriptions_guard
  before insert or update on public.crm_report_subscriptions
  for each row execute function public.crm_report_subscriptions_guard();

drop trigger if exists crm_report_subscriptions_touch on public.crm_report_subscriptions;
create trigger crm_report_subscriptions_touch
  before update on public.crm_report_subscriptions
  for each row execute function public.crm_touch_updated_at();

-- -----------------------------------------------------------------------------
-- 2) Gönderim kaydı
-- -----------------------------------------------------------------------------

create table if not exists public.crm_report_runs (
  id bigint generated always as identity primary key,
  subscription_id uuid not null references public.crm_report_subscriptions(id) on delete cascade,
  run_at timestamptz not null default now(),
  trigger text not null default 'CRON',
  sent_to_count integer not null default 0,
  status text not null,
  error text,
  constraint crm_report_runs_trigger_check check (trigger in ('CRON', 'MANUAL')),
  constraint crm_report_runs_count_check check (sent_to_count between 0 and 1000),
  constraint crm_report_runs_status_check check (status in ('SENT', 'FAILED', 'SKIPPED')),
  -- Kısa kod (ör. "resend:422", "failed:2/5"); alıcı adresi ya da sağlayıcı mesajı yazılmaz.
  constraint crm_report_runs_error_check
    check ((error is null or char_length(error) <= 200) and (status <> 'FAILED' or error is not null)),
  constraint crm_report_runs_sent_check check (status <> 'SENT' or sent_to_count > 0)
);

create index if not exists crm_report_runs_subscription_idx on public.crm_report_runs (subscription_id, run_at desc);

-- -----------------------------------------------------------------------------
-- 3) Yetkiler — yalnız service_role
-- -----------------------------------------------------------------------------

alter table public.crm_report_subscriptions enable row level security;
alter table public.crm_report_runs enable row level security;

revoke all on table public.crm_report_subscriptions, public.crm_report_runs from public, anon, authenticated;
grant select, insert, update, delete on table public.crm_report_subscriptions to service_role;
grant select, insert on table public.crm_report_runs to service_role;
grant usage, select on sequence public.crm_report_runs_id_seq to service_role;

revoke execute on function public.crm_report_subscriptions_guard() from public, anon, authenticated;

commit;

-- =============================================================================
-- GERİ ALMA (gerekirse elle; abonelikler ve gönderim kaydı silinir):
--   begin;
--   drop table if exists public.crm_report_runs, public.crm_report_subscriptions;
--   drop function if exists public.crm_report_subscriptions_guard();
--   commit;
-- =============================================================================
