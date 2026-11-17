-- =============================================================================
-- EdorasCRM · 20261117120000 — Soru ve bilgi kartı havuzu: Haiku ön incelemesi + otomatik karar izi
--
-- NEREYE: CRM'in canlı veritabanı (TR, supabase-crm-db). Uygulama: infra/tr/tr-migration.sh --crm <dosya>
-- (önce kuru deneme, sonra --uygula; kullanıcı kendi terminalinde). Edoras panel veritabanına bu dosyadan
-- hiçbir şey gitmez.
--
-- NEDEN: Gece işi (edoras-soru-havuzu) bekleyen soru ve desteleri Haiku ile ikinci kez denetler (soru: anahtarı
-- görmeden bağımsız çözüm + kalite yoklaması; deste: kitap metnine karşı). Sonuç satıra yazılır, onay kuyruğunda
-- rozet olarak görünür. Kurum bayrakları açıksa (AI_REVIEW_AUTO_REJECT / AI_REVIEW_AUTO_APPROVE) CRM kararı da verir.
--
-- NE EKLER (iki tabloda da aynı):
--  ai_verdict      ONAY | RED | BELIRSIZ (boş = henüz denetlenmedi)
--  ai_confidence   0..1
--  ai_reason       kısa gerekçe (en çok 500 karakter)
--  ai_reviewed_at  denetim anı; boşsa gece işi bu satırı henüz görmedi
--  ai_model        denetleyen model
--  auto_reviewed   karar insan değil otomatik verildi (reviewed_by BOŞ olabilir)
--
-- KISIT DEĞİŞİKLİĞİ: karar verilmiş satırda eskiden reviewed_by zorunluydu. Artık ya insan (reviewed_by dolu) ya
-- otomatik (auto_reviewed + ai_verdict dolu) olmalı; ikisinde de reviewed_at dolu. Bekleyen satırda hâlâ hepsi boş.
-- Mevcut satırlar yeni kısıta uyar (auto_reviewed hepsinde false, reviewed_by dolu).
--
-- GÜVENLİK: RLS değişmez (açık, politikasız → yalnız service_role).
-- =============================================================================

alter table public.crm_question_pool
  add column if not exists ai_verdict text,
  add column if not exists ai_confidence real,
  add column if not exists ai_reason text,
  add column if not exists ai_reviewed_at timestamptz,
  add column if not exists ai_model text,
  add column if not exists auto_reviewed boolean not null default false;

alter table public.crm_flashcard_decks
  add column if not exists ai_verdict text,
  add column if not exists ai_confidence real,
  add column if not exists ai_reason text,
  add column if not exists ai_reviewed_at timestamptz,
  add column if not exists ai_model text,
  add column if not exists auto_reviewed boolean not null default false;

alter table public.crm_question_pool
  add constraint crm_question_pool_ai_check check (
    (ai_verdict is null or ai_verdict in ('ONAY', 'RED', 'BELIRSIZ'))
    and (ai_confidence is null or (ai_confidence >= 0 and ai_confidence <= 1))
    and (ai_reason is null or char_length(ai_reason) <= 500)
  );
alter table public.crm_flashcard_decks
  add constraint crm_flashcard_decks_ai_check check (
    (ai_verdict is null or ai_verdict in ('ONAY', 'RED', 'BELIRSIZ'))
    and (ai_confidence is null or (ai_confidence >= 0 and ai_confidence <= 1))
    and (ai_reason is null or char_length(ai_reason) <= 500)
  );

alter table public.crm_question_pool drop constraint crm_question_pool_review_check;
alter table public.crm_question_pool add constraint crm_question_pool_review_check check (
  (status = 'PENDING' and reviewed_by is null and reviewed_at is null and not auto_reviewed)
  or (status <> 'PENDING' and reviewed_at is not null
      and ((not auto_reviewed and reviewed_by is not null) or (auto_reviewed and ai_verdict is not null)))
);

alter table public.crm_flashcard_decks drop constraint crm_flashcard_decks_review_check;
alter table public.crm_flashcard_decks add constraint crm_flashcard_decks_review_check check (
  (status = 'PENDING' and reviewed_by is null and reviewed_at is null and not auto_reviewed)
  or (status <> 'PENDING' and reviewed_at is not null
      and ((not auto_reviewed and reviewed_by is not null) or (auto_reviewed and ai_verdict is not null)))
);

-- Gece işi "henüz denetlenmemiş bekleyenler"i çeker.
create index if not exists crm_question_pool_ai_todo_idx
  on public.crm_question_pool (created_at desc) where status = 'PENDING' and ai_reviewed_at is null;
create index if not exists crm_flashcard_decks_ai_todo_idx
  on public.crm_flashcard_decks (created_at desc) where status = 'PENDING' and ai_reviewed_at is null;

-- =============================================================================
-- GERİ ALMA (yalnız gerekirse, elle; otomatik karar verilmiş satır varsa önce onları PENDING'e çevir):
--   alter table public.crm_question_pool drop constraint crm_question_pool_review_check;
--   alter table public.crm_question_pool add constraint crm_question_pool_review_check check (
--     (status = 'PENDING' and reviewed_by is null and reviewed_at is null)
--     or (status <> 'PENDING' and reviewed_by is not null and reviewed_at is not null));
--   (aynısı crm_flashcard_decks / crm_flashcard_decks_review_check için)
--   alter table public.crm_question_pool drop column ai_verdict, drop column ai_confidence, drop column ai_reason,
--     drop column ai_reviewed_at, drop column ai_model, drop column auto_reviewed;   (decks için de)
-- =============================================================================
