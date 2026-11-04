-- =============================================================================
-- EdorasCRM · 20261104120000 — Soru havuzu: gece üretilen sorular ve yönetici onayı
--
-- NEREYE: CRM'in canlı veritabanı (TR, supabase-crm-db). Uygulama: infra/tr/tr-migration.sh --crm <dosya>
-- (önce kuru deneme, sonra --uygula; kullanıcı kendi terminalinden). Edoras'ın canlı veritabanına bu
-- dosyadan hiçbir şey gitmez.
--
-- NEDEN: Her gece iki kaynaktan (AIG kodla üretim, LLM üretimi) soru üretilir; yönetici bunları CRM'de tek tek
-- onaylar ya da reddeder. Öğretmen onay kapısı yoktur.
--
-- NE EKLER:
--  1) crm_question_pool — üretilen her soru. body: kök, şıklar, anahtar, açıklama (jsonb). content_hash tekil:
--     aynı soru iki kez girmez. status: PENDING → APPROVED | REJECTED. Karar değişince aynı satırın durumu
--     güncellenir; ayrı karar geçmişi tutulmaz (gerekirse review_note ile not düşülür).
--  2) crm_question_pool_runs — gece çalışma kaydı. (run_date, source) tekil: aynı gece iki kez tetiklenirse
--     ikinci çalışma üretmez (idempotens). Yalnız sayılar ve kısa hata kodu tutulur.
--
-- KURALLAR: source ∈ {AIG, LLM}; subject zorunlu; status ∈ {PENDING, APPROVED, REJECTED}; onaylanan/reddedilen
-- satırda reviewed_by + reviewed_at zorunlu; PENDING satırda reviewed_* boş.
--
-- GÜVENLİK: RLS açık, POLİTİKA YOK → yalnız service_role. Sunucu uçları yalnız ADMIN görür/onaylar; gece
-- yazıcısı CRON_SECRET ile yetkilendirilir (uç tarafında, bu dosyada değil).
--
-- Geri almak: dosyanın sonundaki "GERİ ALMA" bloğu.
--
-- UYGULANMADI: yalnız dosya ve test. Canlıya uygulama ayrı onayla yapılır.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1) Soru havuzu
-- -----------------------------------------------------------------------------

create table if not exists public.crm_question_pool (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  subject text not null,
  objective_code text,
  model text not null,
  run_date date not null,
  body jsonb not null,
  content_hash text not null,
  check_flags text[] not null default '{}',
  status text not null default 'PENDING',
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  constraint crm_question_pool_source_check check (source in ('AIG', 'LLM')),
  constraint crm_question_pool_subject_check check (char_length(subject) between 1 and 60),
  constraint crm_question_pool_status_check check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  constraint crm_question_pool_body_check check (jsonb_typeof(body) = 'object'),
  constraint crm_question_pool_review_check
    check (
      (status = 'PENDING' and reviewed_by is null and reviewed_at is null)
      or (status <> 'PENDING' and reviewed_by is not null and reviewed_at is not null)
    ),
  constraint crm_question_pool_review_note_check check (review_note is null or char_length(review_note) <= 500)
);

-- Aynı soru iki kez girmesin (kaynak + içerik özeti).
create unique index if not exists crm_question_pool_hash_uidx on public.crm_question_pool (content_hash);

-- Onay kuyruğu: bekleyenler, en yeni önce.
create index if not exists crm_question_pool_queue_idx
  on public.crm_question_pool (status, created_at desc);

-- -----------------------------------------------------------------------------
-- 2) Gece çalışma kaydı
-- -----------------------------------------------------------------------------

create table if not exists public.crm_question_pool_runs (
  id uuid primary key default gen_random_uuid(),
  run_date date not null,
  source text not null,
  requested integer not null default 0,
  inserted integer not null default 0,
  skipped_duplicate integer not null default 0,
  rejected_by_check integer not null default 0,
  error_code text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  constraint crm_question_pool_runs_source_check check (source in ('AIG', 'LLM')),
  constraint crm_question_pool_runs_counts_check
    check (requested >= 0 and inserted >= 0 and skipped_duplicate >= 0 and rejected_by_check >= 0),
  constraint crm_question_pool_runs_error_check check (error_code is null or char_length(error_code) <= 60)
);

-- İdempotens: gece başına her kaynak için en fazla bir çalışma.
create unique index if not exists crm_question_pool_runs_day_source_uidx
  on public.crm_question_pool_runs (run_date, source);

-- -----------------------------------------------------------------------------
-- 3) Güvenlik: yalnız service_role
-- -----------------------------------------------------------------------------

alter table public.crm_question_pool enable row level security;
alter table public.crm_question_pool_runs enable row level security;


-- =============================================================================
-- GERİ ALMA (yalnız gerekirse, elle):
--   drop table if exists public.crm_question_pool_runs;
--   drop table if exists public.crm_question_pool;
-- =============================================================================
