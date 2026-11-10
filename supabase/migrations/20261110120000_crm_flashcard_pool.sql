-- =============================================================================
-- EdorasCRM · 20261110120000 — Bilgi kartı havuzu: gece üretilen desteler ve yönetici onayı
--
-- NEREYE: CRM'in canlı veritabanı (TR, supabase-crm-db). Uygulama: infra/tr/tr-migration.sh --crm <dosya>
-- (önce kuru deneme, sonra --uygula; kullanıcı kendi terminalinden). Edoras'ın canlı veritabanına bu
-- dosyadan hiçbir şey gitmez (panel tarafı Edoras migration 379_flashcards).
--
-- NEDEN: Bilgi kartları (panel modülü `flashcards`, plan Ls7nGsrd F2) kazanım başına gece toplu üretilir — MEB ders
-- kitabının o kazanımı anlatan bölümünden — ve yönetici bunları CRM'de DESTE olarak onaylar ya da reddeder.
-- Onaylanan destenin kartları panelin `flashcards` tablosuna yazılır. Soru havuzuyla (20261104120000) aynı yol.
--
-- NE EKLER:
--  1) crm_flashcard_decks — üretilen her deste. Kazanım KİMLİĞİYLE gelir (`objective_id` = Edoras
--     `objective_registry.id`): soru havuzundaki kod → ders eşleştirmesi burada yok. cards: [{id, front, back}]
--     (id CRM'de üretilir, panelde `flashcards.crm_card_id`). excluded_card_ids: onayda yöneticinin çıkardığı
--     kartlar (panele gitmez). source_ref: dayandığı kitap ve sayfalar (kitap metni DEĞİL).
--  2) crm_flashcard_runs — gece çalışma kaydı. run_date tekil: aynı gece iki kez tetiklenirse ikinci çalışma yazmaz.
--  3) crm_flashcard_declines — destesi çıkmayan kazanımlar (bölüm konuyu karşılamıyor / bağlam kısa). Gece işi
--     "kapsanan" listesini (deste ∪ ret) GET /api/cron/flashcard-pool ile alır, bunları yeniden üretmez.
--
-- GÜVENLİK: RLS açık, POLİTİKA YOK → yalnız service_role. Sunucu uçları yalnız ADMIN; gece yazıcısı CRON_SECRET.
--
-- Geri almak: dosyanın sonundaki "GERİ ALMA" bloğu.
--
-- UYGULANMADI: yalnız dosya ve test. Canlıya uygulama ayrı onayla yapılır.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1) Deste havuzu
-- -----------------------------------------------------------------------------

create table if not exists public.crm_flashcard_decks (
  id uuid primary key default gen_random_uuid(),
  objective_id bigint not null,
  objective_code text,
  objective_text text,
  subject text not null,
  model text not null,
  run_date date not null,
  cards jsonb not null,
  excluded_card_ids uuid[] not null default '{}',
  source_ref jsonb not null default '{}'::jsonb,
  content_hash text not null,
  status text not null default 'PENDING',
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  constraint crm_flashcard_decks_objective_check check (objective_id > 0),
  constraint crm_flashcard_decks_subject_check check (char_length(subject) between 1 and 60),
  constraint crm_flashcard_decks_cards_check
    check (jsonb_typeof(cards) = 'array' and jsonb_array_length(cards) between 1 and 20),
  constraint crm_flashcard_decks_source_ref_check check (jsonb_typeof(source_ref) = 'object'),
  constraint crm_flashcard_decks_status_check check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  constraint crm_flashcard_decks_review_check
    check (
      (status = 'PENDING' and reviewed_by is null and reviewed_at is null)
      or (status <> 'PENDING' and reviewed_by is not null and reviewed_at is not null)
    ),
  constraint crm_flashcard_decks_review_note_check check (review_note is null or char_length(review_note) <= 500)
);

-- Aynı deste iki kez girmesin (kazanım + kartların içerik özeti).
create unique index if not exists crm_flashcard_decks_hash_uidx on public.crm_flashcard_decks (content_hash);

-- Onay kuyruğu: bekleyenler, en yeni önce.
create index if not exists crm_flashcard_decks_queue_idx
  on public.crm_flashcard_decks (status, created_at desc);

-- -----------------------------------------------------------------------------
-- 2) Gece çalışma kaydı
-- -----------------------------------------------------------------------------

create table if not exists public.crm_flashcard_runs (
  id uuid primary key default gen_random_uuid(),
  run_date date not null,
  requested integer not null default 0,
  inserted integer not null default 0,
  skipped_duplicate integer not null default 0,
  rejected_by_check integer not null default 0,
  error_code text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  constraint crm_flashcard_runs_counts_check
    check (requested >= 0 and inserted >= 0 and skipped_duplicate >= 0 and rejected_by_check >= 0),
  constraint crm_flashcard_runs_error_check check (error_code is null or char_length(error_code) <= 60)
);

-- İdempotens: gece başına en fazla bir çalışma.
create unique index if not exists crm_flashcard_runs_day_uidx on public.crm_flashcard_runs (run_date);

-- -----------------------------------------------------------------------------
-- 3) Kartsız kalan kazanımlar
-- -----------------------------------------------------------------------------
-- Model "bölüm bu kazanımı karşılamıyor" dediğinde ya da bağlam çok kısaysa deste gelmez; kazanım buraya yazılır ki gece
-- işi onu her gece yeniden denemesin. Yeniden denemek için satır elle silinir.

create table if not exists public.crm_flashcard_declines (
  objective_id bigint primary key,
  reason text,
  run_date date not null,
  created_at timestamptz not null default now(),
  constraint crm_flashcard_declines_objective_check check (objective_id > 0),
  constraint crm_flashcard_declines_reason_check check (reason is null or char_length(reason) <= 300)
);

-- -----------------------------------------------------------------------------
-- 4) Güvenlik: yalnız service_role
-- -----------------------------------------------------------------------------

alter table public.crm_flashcard_decks enable row level security;
alter table public.crm_flashcard_runs enable row level security;
alter table public.crm_flashcard_declines enable row level security;


-- =============================================================================
-- GERİ ALMA (yalnız gerekirse, elle):
--   drop table if exists public.crm_flashcard_declines;
--   drop table if exists public.crm_flashcard_runs;
--   drop table if exists public.crm_flashcard_decks;
-- =============================================================================
