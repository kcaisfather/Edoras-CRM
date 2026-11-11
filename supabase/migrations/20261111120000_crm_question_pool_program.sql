-- =============================================================================
-- EdorasCRM · 20261111120000 — Soru havuzu: sorunun sınavı (`program`: yks | lgs)
--
-- NEREYE: CRM'in canlı veritabanı (TR, supabase-crm-db). Uygulama: infra/tr/tr-migration.sh --crm <dosya>
-- (önce kuru deneme, sonra --uygula; kullanıcı kendi terminalinden). Edoras'ın canlı veritabanına bu
-- dosyadan hiçbir şey gitmez.
--
-- NEDEN: YKS/LGS ayrımı ÜRETİMDE yapılır (plan Ls7nGsrd F4.1). Gece üreticisi her soruya program yazar; CRM onayda
-- kazanım adaylarını bu programla süzer ve programı panelin `mini_test_questions.program` sütununa (panel migration
-- 384) taşır. Düello ve Mini Test öğrenciye yalnız kendi sınavının sorusunu verir.
--
-- MEVCUT SATIRLAR: 11.11'de canlıda 233 satır vardı, hepsi YKS üreticisinden (AIG modülleri + YKS istemli LLM);
-- LGS üreten kaynak yok. Bu yüzden boş satırlar 'yks' ile doldurulur. Yeni satırda program ZORUNLU, varsayılan YOK.
--
-- SIRA: üretici (program gönderen sürüm) → panel 384 → bu dosya → CRM deploy'u.
--
-- Geri almak: dosyanın sonundaki "GERİ ALMA" bloğu.
-- =============================================================================

alter table public.crm_question_pool add column if not exists program text;

update public.crm_question_pool set program = 'yks' where program is null;

alter table public.crm_question_pool alter column program set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'crm_question_pool_program_check') then
    alter table public.crm_question_pool
      add constraint crm_question_pool_program_check check (program in ('yks', 'lgs'));
  end if;
end $$;

comment on column public.crm_question_pool.program is
  'Sorunun sınavı (yks | lgs). Üretici yazar; onayda panel mini_test_questions.program sütununa taşınır.';

-- -----------------------------------------------------------------------------
-- GERİ ALMA (önce CRM kodunu program okumayan sürüme döndür):
--   alter table public.crm_question_pool drop constraint if exists crm_question_pool_program_check;
--   alter table public.crm_question_pool drop column if exists program;
-- -----------------------------------------------------------------------------
