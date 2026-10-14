-- =============================================================================
-- EdorasCRM · 20261014120000 — Yönetim (KCA Panel) hesap bağları
--
-- NEREYE: EdorasCRM'in kendi Supabase projesi (orishbqniebbgdanazrp). Edoras'a ve KCA Panel'e dokunmaz.
-- NEDEN (kurucu, 2026-10-14): "kca-panel.vercel.app ile burayı birleştir: Yönetim Görevleri, Network, Toplantı notları
--   CRM'de; Turso'daki backend kullanılsın, aynı veriyi işlesin; Edoras etiketi olmayan hiçbir şeyi görmesin."
--
-- Görev, toplantı notu ve network verisi CRM'de TUTULMAZ: KCA Panel'in Turso veritabanında durur, CRM sunucusu oraya
-- doğrudan bağlanır (lib/server/kca.ts). Burada yalnız "hangi CRM personeli hangi KCA Panel hesabıdır" bağı saklanır.
-- KCA Panel'de network kişiye özel, toplantı notu sahibine aittir — bu yüzden bağ e-posta eşleşmesiyle KURULMAZ (CRM'de
-- personel açabilen biri başkasının e-postasıyla hesap açıp onun notlarını göremesin): personel KCA Panel şifresini bir
-- kez girer, sunucu doğrular, bağ yazılır.
--
--   crm_kca_links: personel başına tek bağ; bir KCA hesabı tek personele bağlanır (yeniden bağlanırsa eski bağ silinir).
--     kca_password_fp = KCA Panel'deki şifre özetinin SHA-256'sı (şifrenin kendisi ya da özeti DEĞİL). Her istekte
--     karşılaştırılır: KCA Panel'de şifre değişince / sıfırlanınca bağ kendiliğinden düşer, personel yeniden bağlar.
--     Personel silinince bağ da silinir.
--
-- GÜVENLİK: yalnız service_role (RLS açık, politika yok; anon / authenticated erişemez).
-- Geri almak: dosyanın sonundaki "GERİ ALMA" bloğu.
-- =============================================================================

begin;

create table if not exists public.crm_kca_links (
  staff_user_id uuid primary key references public.crm_staff(user_id) on delete cascade,
  kca_user_id integer not null check (kca_user_id > 0),
  kca_password_fp text not null check (kca_password_fp ~ '^[0-9a-f]{64}$'),
  linked_at timestamptz not null default now(),
  constraint crm_kca_links_kca_user_key unique (kca_user_id)
);

comment on table public.crm_kca_links is
  'Yönetim (KCA Panel) hesap bağı: CRM personeli ↔ KCA Panel kullanıcısı (Turso users.id). KCA şifresiyle kurulur; '
  'şifre değişince (kca_password_fp tutmaz) düşer. Veri KCA Panel''de, burada yalnız bağ.';

alter table public.crm_kca_links enable row level security;
revoke all on table public.crm_kca_links from public, anon, authenticated;
grant select, insert, update, delete on table public.crm_kca_links to service_role;

commit;

-- =============================================================================
-- GERİ ALMA (bağlar silinir; KCA Panel verisine dokunulmaz):
--   begin;
--   drop table if exists public.crm_kca_links;
--   commit;
-- =============================================================================
