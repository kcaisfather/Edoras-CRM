-- =============================================================================
-- EdorasCRM · 20261012120000 — demo süresi kurum bazlı (sabit "1 yıl" kalktı)
--
-- NEREYE: EdorasCRM'in kendi Supabase projesi (orishbqniebbgdanazrp). Edoras'a dokunmaz.
-- DURUM: CANLIYA ELLE UYGULANACAK (panel SQL Editor) — kod deploy'undan ÖNCE. Yeni kod crm_enroll_institution'ı
--        p_demo_ends_on ile çağırır, eski 13 parametreli imza burada kalkar: migration ile deploy arasında demo açma /
--        CRM'e kaydetme / satışla hesap açma çalışmaz. İkisini art arda yapın. (Ters sıra da aynı pencereyi açar; bu
--        sıra güvenlidir çünkü eski kod geçersiz veri yazamaz.)
-- NEDEN (kurucu, 2026-10-12): "demo süresi kurum bazlı değişebilsin, sistemde sabit bir şey olmasın".
-- KARAR (kurucu, 2026-10-12):
--   * Süre her demo açılışında SEÇİLİR (panel hızlı seçimleri: 14 gün / 1 ay / 3 ay / 1 yıl ya da özel bitiş tarihi).
--     Hazır / varsayılan süre YOK: bitiş verilmezse veritabanı reddeder (CRM_DEMO_END_REQUIRED).
--   * Açık demonun bitişini sonradan yalnız YÖNETİCİ (ADMIN) değiştirir — uzatma da kısaltma da. Ayrı fonksiyon yok:
--     sunucu (lib/server/institutions.ts updateDemoEnd) satırı günceller, aşağıdaki kısıt korur, işlem kaydına önceki /
--     yeni bitiş yazılır (DEMO_END_UPDATED).
--   * Lisans DEĞİŞMEDİ: ücretli lisans yine 1 dönem = 1 yıl (crm_licenses_one_year_check).
--
--   1) crm_institutions_demo_dates_check: DEMO satırında başlangıç ve bitiş dolu, bitiş > başlangıç (aralık
--      [başlangıç, bitiş) en az 1 gün). Eski kural "bitiş = başlangıç + 1 yıl" idi; mevcut DEMO satırları yeni kuralı
--      zaten sağlar (veri dönüşümü yok). Ücretliye geçmiş satırın demo tarihleri geçmiş olarak kalır, kısıt bakmaz.
--   2) crm_enroll_institution: yeni p_demo_ends_on (p_demo_starts_on'dan hemen sonra; 14 parametre). DEMO'da başlangıç
--      yoksa CRM_DEMO_START_REQUIRED, bitiş yoksa CRM_DEMO_END_REQUIRED; bitiş ≤ başlangıç kısıta takılır. UCRETLI dalı
--      aynı (demo tarihleri yazılmaz). Eski imza açıkça DROP edilir: CREATE OR REPLACE yeni imzayı ayrı fonksiyon sayar.
--
-- GÜVENLİK: fonksiyon PUBLIC / anon / authenticated'dan geri alındı, yalnız service_role (crm_core ile aynı).
-- Geri almak: dosyanın sonundaki "GERİ ALMA" bloğu.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1) Demo tarihleri: bitiş > başlangıç (süre kurum bazlı)
-- -----------------------------------------------------------------------------

alter table public.crm_institutions drop constraint if exists crm_institutions_demo_dates_check;
alter table public.crm_institutions add constraint crm_institutions_demo_dates_check
  check (status <> 'DEMO' or (demo_started_at is not null
                              and demo_ends_at is not null
                              and demo_ends_at > demo_started_at));

comment on column public.crm_institutions.demo_ends_at is
  'Demonun bitişi (aralık [demo_started_at, demo_ends_at): bitiş günü demo bitmiştir). Süre kurum bazlı: açarken '
  'seçilir, sonradan yalnız ADMIN değiştirir (2026-10-12). Ücretliye geçince geçmiş olarak kalır.';

-- -----------------------------------------------------------------------------
-- 2) Kayda alma: demonun bitişi parametre (varsayılan süre yok)
-- -----------------------------------------------------------------------------

drop function if exists public.crm_enroll_institution(uuid, text, text, text, text, text, text, text, text, date, date, numeric, uuid);

-- Kurumu CRM'e kaydeder: DEMO (başlangıç + seçilen bitiş) ya da UCRETLI (fatura + süren lisansın başlangıcı ve bedeli;
-- lisans 1 yıl). Yeni demo açarken de bu çağrılır (başlangıç = bugün).
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
  p_demo_ends_on date,
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
    -- Hazır süre yok: bitişi çağıran seçer. Bitiş ≤ başlangıç crm_institutions_demo_dates_check'e takılır.
    if p_demo_ends_on is null then
      raise exception 'CRM_DEMO_END_REQUIRED';
    end if;
    insert into public.crm_institutions (
      institution_id, institution_name, status, contact_name, contact_phone, contact_email,
      address, tc_no, tax_no, demo_started_at, demo_ends_at, created_by
    )
    values (
      p_institution_id, btrim(p_institution_name), 'DEMO', btrim(p_contact_name), p_contact_phone,
      lower(btrim(p_contact_email)), nullif(btrim(p_address), ''), nullif(p_tc_no, ''), nullif(p_tax_no, ''),
      p_demo_starts_on, p_demo_ends_on, p_created_by
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

revoke execute on function
  public.crm_enroll_institution(uuid, text, text, text, text, text, text, text, text, date, date, date, numeric, uuid)
  from public, anon, authenticated;

grant execute on function
  public.crm_enroll_institution(uuid, text, text, text, text, text, text, text, text, date, date, date, numeric, uuid)
  to service_role;

commit;

-- =============================================================================
-- GERİ ALMA (gerekirse elle). Eski kısıt "bitiş = başlangıç + 1 yıl" ister: önce DEMO satırlarının bitişi buna çekilir
-- — bu, kurumlara verilmiş süreyi DEĞİŞTİRİR; geri almadan önce kurucuya sorun. Eski kod da aynı anda geri alınmalı.
--   begin;
--   update public.crm_institutions
--      set demo_ends_at = (demo_started_at + interval '1 year')::date
--    where status = 'DEMO' and demo_ends_at is distinct from (demo_started_at + interval '1 year')::date;
--   alter table public.crm_institutions drop constraint if exists crm_institutions_demo_dates_check;
--   alter table public.crm_institutions add constraint crm_institutions_demo_dates_check
--     check (status <> 'DEMO' or (demo_started_at is not null
--                                 and demo_ends_at = (demo_started_at + interval '1 year')::date));
--   comment on column public.crm_institutions.demo_ends_at is null;
--   drop function if exists public.crm_enroll_institution(uuid, text, text, text, text, text, text, text, text, date, date, date, numeric, uuid);
--   -- ardından 20260929120000_crm_core.sql'deki 13 parametreli crm_enroll_institution tanımı ve onun revoke / grant
--   -- satırları (yalnız bu fonksiyonun imzasıyla) yeniden çalıştırılır.
--   commit;
-- =============================================================================
