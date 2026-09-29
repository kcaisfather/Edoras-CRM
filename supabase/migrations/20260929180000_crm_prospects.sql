-- =============================================================================
-- EdorasCRM · 20260929180000 — Soğuk listeler (crm_prospect_lists, crm_prospects)
--
-- NEREYE: EdorasCRM'in kendi Supabase projesi (orishbqniebbgdanazrp). Edoras'a dokunmaz.
--
-- DeepSportAdmin "Soğuk listeler + içe aktarma" sözleşmesinin (docs/backend-requests.md → Madde 13 + EK-1
-- PROSPECTS) gerçek tablo karşılığı. DeepSport'ta bayrak kapalıyken listeler tarayıcıda (localStorage, ekip
-- göremez) tutuluyordu; burada ekipçe paylaşılır:
--   * crm_prospect_lists: içe aktarılan liste (ad, dosya adı, açan). Liste silinince kişileri de silinir.
--   * crm_prospects: CRM'e henüz girmemiş aranacak kişi. Telefon ve e-posta hem ham (dosyadaki hali) hem
--     normalize (E.164 / küçük harf) tutulur; normalize değeri SUNUCU hesaplar (lib/import/bulk.ts), istemcinin
--     gönderdiği normalize değere güvenilmez. `branch` DeepSport'taki branş kolonudur; Edoras'ta ekranda
--     "Program / tür" (serbest metin) olarak gösterilir.
--   * Arama sonucu (outcome) NOT_CALLED | UNREACHABLE | NOT_INTERESTED | TALKED; sonucun anı (outcome_at) sunucuda
--     yazılır. Görevlerim'deki "Soğuk liste araması" (kural coldList) bu iki kolondan TÜRETİLİR
--     (lib/domain/tasks/cold.ts): crm_tasks'a satır yazılmaz, sonuç değişince görev düşer ya da ileri kayar.
--   * "Sıcağa taşı" = crm_convert_prospect: CRM adayı (kaynak COLD_LIST) + isteğe bağlı not + kişinin taşındı
--     işareti TEK transaction.
--   * Toplu ekleme = crm_add_prospects: sunucu mükerrerleri (dosya içi, CRM adayları, kurum yetkilileri, aynı
--     liste) önceden ayıklar; aynı listeye eşzamanlı içe aktarmada kalan çakışmayı bu fonksiyon `on conflict do
--     nothing` ile atlar ve atladığı satırların sırasını döndürür.
--   * crm_prospect_list_counts: liste başına kişi sayısı (liste seçicisi; kişiler yalnız seçili liste için okunur).
--
-- KURALLAR (veritabanında da zorunlu; sunucu service_role ile bağlanır, RLS'i görmez):
--   * Liste adı 1–120 karakter (boşluk kırpılır) → crm_prospect_lists_name_check.
--   * Kişinin en az adı, soyadı, kurumu, telefonu ya da e-postası olur → crm_prospects_identity_check.
--   * Telefon E.164 (ham değer olmadan olmaz), e-posta biçimli ve küçük harf → crm_prospects_phone/email_check.
--   * Aynı listede aynı telefon / e-posta bir kez → crm_prospects_list_phone_key / _list_email_key (kısmi benzersiz).
--   * outcome tanımlı değerlerden; outcome_at ancak ve ancak outcome ≠ NOT_CALLED iken dolu → outcome_at_check.
--   * crm_lead_id doluysa moved_at dolu → crm_prospects_moved_check. TEK YÖNLÜ: aday silinince FK `on delete set
--     null` crm_lead_id'yi boşaltır, moved_at tarihçe olarak kalır ("CRM'e taşınmıştı"); iki yönlü bir CHECK aday
--     silmeyi kırardı. Taşınmış (moved_at dolu) kişi görev üretmez; adayı silinmişse yeniden taşınabilir, adayı
--     duruyorsa ikinci kez taşınamaz (CRM_PROSPECT_ALREADY_MOVED).
--   * Uzunluklar crm_leads sınırlarının altında (taşıma uzunluk yüzünden patlamasın) → crm_prospects_length_check.
--   * Toplu eklemede istek başına en çok 2000 satır → CRM_PROSPECT_BATCH_TOO_LARGE.
--   * Boş metin null'a çevrilir, ad / kurum boşlukları tekilleşir (crm_prospects_normalize) — kimlik kuralı
--     boşlukla aşılmaz. E-posta tetikleyicide küçültülmez: CHECK sunucunun normalleştirmesini zorlar.
--
-- GÜVENLİK: RLS açık, POLİTİKA YOK → yalnız service_role. Fonksiyonlar PUBLIC'ten geri alındı. Kişisel veri:
-- Ayarlar → KVKK envanterinde "Soğuk liste kişileri" (saklama: liste silinince kişileri de silinir).
-- Geri almak: dosyanın sonundaki "GERİ ALMA" bloğu.
--
-- UYGULANDI: 2026-09-29, CRM projesine Supabase MCP apply_migration ile (ad: crm_prospects); dış
-- begin/commit çıkarılarak gönderildi.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1) Listeler
-- -----------------------------------------------------------------------------

create table if not exists public.crm_prospect_lists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- İçe aktarılan dosyanın adı (bilgi).
  source_file text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint crm_prospect_lists_name_check check (length(name) between 1 and 120),
  constraint crm_prospect_lists_source_file_check check (source_file is null or length(source_file) <= 255)
);

comment on table public.crm_prospect_lists is
  'EdorasCRM soğuk listeleri (içe aktarılan aranacak kişi listeleri, ekipçe paylaşılır). Yalnız service_role.';

create index if not exists crm_prospect_lists_created_idx on public.crm_prospect_lists (created_at);

create or replace function public.crm_prospect_lists_normalize()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  new.name := btrim(regexp_replace(coalesce(new.name, ''), '\s+', ' ', 'g'));
  new.source_file := nullif(btrim(new.source_file), '');
  return new;
end;
$$;

drop trigger if exists crm_prospect_lists_normalize on public.crm_prospect_lists;
create trigger crm_prospect_lists_normalize
  before insert or update on public.crm_prospect_lists
  for each row execute function public.crm_prospect_lists_normalize();

-- -----------------------------------------------------------------------------
-- 2) Kişiler
-- -----------------------------------------------------------------------------

create table if not exists public.crm_prospects (
  id uuid primary key default gen_random_uuid(),
  -- Ekleme sırası: dosyadaki satır sırası korunur (liste ekranı ve Görevlerim'e düşen aranmamış kişiler bu sırayla).
  seq bigint generated always as identity,
  list_id uuid not null references public.crm_prospect_lists(id) on delete cascade,
  first_name text,
  last_name text,
  organization text,
  -- Dosyadaki haliyle telefon; `phone` ondan sunucuda türetilir (TR normalizasyonu), çevrilemezse null.
  phone_raw text,
  phone text,
  email_raw text,
  email text,
  city text,
  district text,
  -- DeepSport "branş"; Edoras'ta "Program / tür" (serbest metin).
  branch text,
  note text,
  outcome text not null default 'NOT_CALLED',
  outcome_at timestamptz,
  crm_lead_id uuid references public.crm_leads(id) on delete set null,
  moved_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_prospects_outcome_check check (outcome in ('NOT_CALLED', 'UNREACHABLE', 'NOT_INTERESTED', 'TALKED')),
  -- Sonuç anı yalnız (ve zorunlu olarak) aranmış kişide.
  constraint crm_prospects_outcome_at_check check ((outcome = 'NOT_CALLED') = (outcome_at is null)),
  constraint crm_prospects_identity_check check (
    first_name is not null or last_name is not null or organization is not null
    or phone_raw is not null or email_raw is not null
  ),
  constraint crm_prospects_phone_check check (
    phone is null or (phone ~ '^\+[1-9][0-9]{7,14}$' and phone_raw is not null)
  ),
  constraint crm_prospects_email_check check (
    email is null or (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and email = lower(email) and email_raw is not null)
  ),
  -- Tek yönlü (bkz. başlık): aday silinince crm_lead_id boşalır, moved_at tarihçe olarak kalır.
  constraint crm_prospects_moved_check check (crm_lead_id is null or moved_at is not null),
  constraint crm_prospects_length_check check (
    coalesce(length(first_name), 0) <= 100
    and coalesce(length(last_name), 0) <= 100
    and coalesce(length(organization), 0) <= 200
    and coalesce(length(phone_raw), 0) <= 50
    and coalesce(length(email_raw), 0) <= 254
    and coalesce(length(email), 0) <= 254
    and coalesce(length(city), 0) <= 100
    and coalesce(length(district), 0) <= 100
    and coalesce(length(branch), 0) <= 100
    and coalesce(length(note), 0) <= 1000
  )
);

comment on table public.crm_prospects is
  'EdorasCRM soğuk liste kişileri (kişisel veri: ad, kurum, telefon, e-posta, il/ilçe). Liste silinince silinir. '
  'Yalnız service_role.';
comment on column public.crm_prospects.branch is
  'DeepSport branş kolonu; Edoras ekranında "Program / tür" (serbest metin).';

-- Aynı listede aynı telefon / e-posta bir kez (farklı listelerde olabilir: her liste ayrı kampanya).
create unique index if not exists crm_prospects_list_phone_key
  on public.crm_prospects (list_id, phone) where phone is not null;
create unique index if not exists crm_prospects_list_email_key
  on public.crm_prospects (list_id, email) where email is not null;
create index if not exists crm_prospects_list_seq_idx on public.crm_prospects (list_id, seq);
-- Görevlerim: taşınmamış, aranmamış / ulaşılamamış kişiler (ekleme sırasıyla).
create index if not exists crm_prospects_callable_idx
  on public.crm_prospects (outcome, seq) where moved_at is null;
-- Aday silinince FK (on delete set null) bu dizinle bulur.
create index if not exists crm_prospects_crm_lead_idx
  on public.crm_prospects (crm_lead_id) where crm_lead_id is not null;

-- Boş metin → null; ad, soyad, kurum ve bölge boşlukları tekilleşir. E-posta küçültülmez (CHECK zorlar).
create or replace function public.crm_prospects_normalize()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  new.first_name := nullif(btrim(regexp_replace(new.first_name, '\s+', ' ', 'g')), '');
  new.last_name := nullif(btrim(regexp_replace(new.last_name, '\s+', ' ', 'g')), '');
  new.organization := nullif(btrim(regexp_replace(new.organization, '\s+', ' ', 'g')), '');
  new.phone_raw := nullif(btrim(new.phone_raw), '');
  new.phone := nullif(btrim(new.phone), '');
  new.email_raw := nullif(btrim(new.email_raw), '');
  new.email := nullif(btrim(new.email), '');
  new.city := nullif(btrim(regexp_replace(new.city, '\s+', ' ', 'g')), '');
  new.district := nullif(btrim(regexp_replace(new.district, '\s+', ' ', 'g')), '');
  new.branch := nullif(btrim(regexp_replace(new.branch, '\s+', ' ', 'g')), '');
  new.note := nullif(btrim(new.note), '');
  return new;
end;
$$;

drop trigger if exists crm_prospects_normalize on public.crm_prospects;
create trigger crm_prospects_normalize
  before insert or update on public.crm_prospects
  for each row execute function public.crm_prospects_normalize();

drop trigger if exists crm_prospects_touch on public.crm_prospects;
create trigger crm_prospects_touch
  before update on public.crm_prospects
  for each row execute function public.crm_touch_updated_at();

-- -----------------------------------------------------------------------------
-- 3) Toplu ekleme ve "Sıcağa taşı" — her biri tek transaction. Çağıran: EdorasCRM sunucusu (service_role).
-- -----------------------------------------------------------------------------

-- Listeye kişileri ekler (sunucu normalleştirip mükerrerleri önceden ayıklar). p_rows: nesne dizisi, anahtarlar
-- tablo kolonlarıyla aynı (first_name … note). Aynı listede telefon / e-posta çakışan satır (eşzamanlı içe
-- aktarma) EKLENMEZ; dönen dizi eklenemeyen satırların p_rows içindeki 0 tabanlı sıralarıdır. Liste yoksa
-- CRM_PROSPECT_LIST_NOT_FOUND; 2000 satırdan fazlası CRM_PROSPECT_BATCH_TOO_LARGE. Başka bir kural (CHECK)
-- tutmazsa hiçbir satır eklenmez.
create or replace function public.crm_add_prospects(p_list_id uuid, p_rows jsonb, p_actor uuid)
returns integer[]
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_row record;
  v_count integer;
  v_skipped integer[] := '{}';
begin
  if p_actor is null then
    raise exception 'CRM_PROSPECT_ACTOR_REQUIRED';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'CRM_PROSPECT_INVALID';
  end if;
  if jsonb_array_length(p_rows) > 2000 then
    raise exception 'CRM_PROSPECT_BATCH_TOO_LARGE' using hint = 'İstek başına en çok 2000 kişi eklenir.';
  end if;
  -- Liste bu işlem bitene kadar silinemez.
  perform 1 from public.crm_prospect_lists l where l.id = p_list_id for key share;
  if not found then
    raise exception 'CRM_PROSPECT_LIST_NOT_FOUND';
  end if;

  for v_row in
    select r.*, (e.ord - 1)::integer as pos
      from jsonb_array_elements(p_rows) with ordinality as e(item, ord)
      cross join lateral jsonb_to_record(e.item) as r(
        first_name text, last_name text, organization text, phone_raw text, phone text,
        email_raw text, email text, city text, district text, branch text, note text
      )
     order by e.ord
  loop
    insert into public.crm_prospects (
      list_id, first_name, last_name, organization, phone_raw, phone, email_raw, email,
      city, district, branch, note, created_by
    )
    values (
      p_list_id, v_row.first_name, v_row.last_name, v_row.organization, v_row.phone_raw, v_row.phone,
      v_row.email_raw, v_row.email, v_row.city, v_row.district, v_row.branch, v_row.note, p_actor
    )
    on conflict do nothing;
    get diagnostics v_count = row_count;
    if v_count = 0 then
      v_skipped := array_append(v_skipped, v_row.pos);
    end if;
  end loop;
  return v_skipped;
end;
$$;

-- "Sıcağa taşı": kişiden CRM adayı (kaynak COLD_LIST, seçilen statü) + isteğe bağlı not + kişinin taşındı işareti.
-- Statü yalnız Aranacak / Takipte / Randevu planlandı (DeepSport MOVE_STATUSES; takip tarihi, teklif ve satış
-- alanı gerektirmez). Adayı duran kişi ikinci kez taşınamaz → CRM_PROSPECT_ALREADY_MOVED. Adayın kimlik, telefon
-- ve e-posta kuralları (crm_leads CHECK'leri) burada da geçerlidir. Herhangi bir adım hata verirse hiçbiri yazılmaz.
create or replace function public.crm_convert_prospect(
  p_prospect_id uuid,
  p_status text,
  p_note text,
  p_actor uuid,
  p_actor_name text
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_p public.crm_prospects%rowtype;
  v_lead uuid;
  v_note text := nullif(btrim(p_note), '');
begin
  if p_actor is null then
    raise exception 'CRM_PROSPECT_ACTOR_REQUIRED';
  end if;
  if p_status is null or p_status not in ('ARANACAK', 'TAKIPTE', 'RANDEVU_PLANLANDI') then
    raise exception 'CRM_PROSPECT_STATUS_INVALID';
  end if;

  select * into v_p from public.crm_prospects p where p.id = p_prospect_id for update;
  if not found then
    raise exception 'CRM_PROSPECT_NOT_FOUND';
  end if;
  if v_p.crm_lead_id is not null then
    raise exception 'CRM_PROSPECT_ALREADY_MOVED' using hint = 'Kişi zaten CRM''e taşınmış.';
  end if;

  insert into public.crm_leads (
    organization_name, contact_first_name, contact_last_name, contact_email, contact_phone,
    city, district, status, source, created_by, updated_by
  )
  values (
    v_p.organization, v_p.first_name, v_p.last_name, v_p.email, v_p.phone,
    v_p.city, v_p.district, p_status, 'COLD_LIST', p_actor, p_actor
  )
  returning id into v_lead;

  if v_note is not null then
    insert into public.crm_notes (lead_id, author_id, author_name, content)
    values (v_lead, p_actor, p_actor_name, v_note);
  end if;

  update public.crm_prospects set crm_lead_id = v_lead, moved_at = now() where id = p_prospect_id;
  return v_lead;
end;
$$;

-- Liste başına kişi sayısı (liste seçicisi). Kişi satırları istemciye yalnız seçili liste için gider.
create or replace function public.crm_prospect_list_counts()
returns table (list_id uuid, total bigint)
language sql
stable
set search_path = public, pg_temp
as $$
  select p.list_id, count(*)::bigint from public.crm_prospects p group by p.list_id;
$$;

-- -----------------------------------------------------------------------------
-- 4) Yetkiler — yalnız service_role
-- -----------------------------------------------------------------------------

alter table public.crm_prospect_lists enable row level security;
alter table public.crm_prospects enable row level security;

revoke all on table public.crm_prospect_lists, public.crm_prospects from public, anon, authenticated;
grant select, insert, update, delete on table public.crm_prospect_lists, public.crm_prospects to service_role;

revoke execute on function
  public.crm_prospect_lists_normalize(),
  public.crm_prospects_normalize(),
  public.crm_add_prospects(uuid, jsonb, uuid),
  public.crm_convert_prospect(uuid, text, text, uuid, text),
  public.crm_prospect_list_counts()
  from public, anon, authenticated;

grant execute on function
  public.crm_add_prospects(uuid, jsonb, uuid),
  public.crm_convert_prospect(uuid, text, text, uuid, text),
  public.crm_prospect_list_counts()
  to service_role;

commit;

-- =============================================================================
-- GERİ ALMA (soğuk listeler ve kişileri silinir; "Sıcağa taşı" ile açılan CRM adayları ve notları kalır):
--   begin;
--   drop function if exists public.crm_prospect_list_counts();
--   drop function if exists public.crm_convert_prospect(uuid, text, text, uuid, text);
--   drop function if exists public.crm_add_prospects(uuid, jsonb, uuid);
--   drop table if exists public.crm_prospects, public.crm_prospect_lists;
--   drop function if exists public.crm_prospects_normalize(), public.crm_prospect_lists_normalize();
--   commit;
-- =============================================================================
