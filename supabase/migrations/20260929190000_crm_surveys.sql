-- =============================================================================
-- EdorasCRM · 20260929190000 — Anketler (crm_surveys, crm_survey_invitations, crm_survey_responses)
--
-- NEREYE: EdorasCRM'in kendi Supabase projesi (orishbqniebbgdanazrp). Edoras'a dokunmaz.
--
-- DeepSportAdmin "Anketler" sözleşmesinin (docs/backend-requests.md → Madde 6–7 SURVEYS) gerçek tablo karşılığı:
--   * crm_surveys: anket tanımı (başlık, giriş metni, sorular). Tek varsayılan anket (NPS 0–10 + memnuniyet 1–5 +
--     yorum) aşağıda yazılır; en çok bir varsayılan olur → crm_surveys_default_key (kısmi benzersiz dizin).
--   * crm_survey_invitations: kişiye özel davet (link). Token SUNUCUDA (Node crypto, ≥ 32 bayt rastgele, base64url)
--     üretilir; tahmin edilemez, benzersizdir. Alıcı CRM adayı (lead_id) ve / veya Edoras kurumudur (institution_id,
--     yumuşak referans — başka veritabanı, FK yok). Ad, kurum adı, e-posta ve telefon davet anında saklanır.
--   * crm_survey_responses: müşterinin yanıtı; davet başına EN ÇOK bir yanıt → crm_survey_responses_invitation_key.
--     Puanı YALNIZ müşteri verir (herkese açık /s/[token] sayfası); panelde puan giriş alanı ve ucu yoktur.
--
-- ZAMANLAYICI YOK:
--   * Süre dolumu OKURKEN hesaplanır: expires_at geçmiş ve yanıtlanmamış davet ekranda EXPIRED görünür
--     (lib/domain/surveys/logic.ts → effectiveStatus). Link ilk açılışta tembelce EXPIRED yazılır (crm_survey_open).
--   * "Anket araması" görevi (kural surveyNoResponse) davetlerden TÜRETİLİR (lib/domain/tasks/derive.ts); tabloya
--     yalnız tamamlanınca crm_tasks'a yazılır (adaya bağlı).
--
-- FONKSİYONLAR (tek transaction; çağıran EdorasCRM sunucusu, service_role):
--   * crm_create_survey_invitation: aynı alıcıya son 7 günde açılmış, yanıtlanmamış ve süresi dolmamış davet varsa
--     YENİSİNİ AÇMAZ, onu döndürür (idempotent; çift tıklama / tekrar gönderim). Alıcı başına danışma kilidi.
--   * crm_survey_open (herkese açık GET): davet OPENED olur (bir kez); durum NOT_FOUND | ANSWERED | EXPIRED | OPEN döner.
--   * crm_survey_submit (herkese açık POST): token + süre + tek yanıt + zorunlu sorular doğrulanır, yanıt yazılır,
--     davet RESPONDED olur. Hatalar: CRM_SURVEY_NOT_FOUND, CRM_SURVEY_EXPIRED, CRM_SURVEY_ANSWERED,
--     CRM_SURVEY_ANSWER_INVALID.
--
-- KURALLAR (veritabanında da zorunlu; sunucu service_role ile bağlanır, RLS'i görmez):
--   * Sorular dizi; her soru { id, type: NPS|CSAT|COMMENT, text?, required } ve her tür / kimlik bir kez
--     → crm_surveys_questions_check. Link geçerliliği 1–365 gün (varsayılan 30).
--   * Kanal EMAIL | WHATSAPP | SMS | LINK; durum CREATED | SENT | OPENED | RESPONDED | EXPIRED | FAILED.
--   * E-posta kanalında e-posta, WhatsApp / SMS'te telefon zorunlu; telefon E.164, e-posta biçimli ve küçük harf.
--   * Durum ve anları tutarlı (gönderilen / açılan / yanıtlanan davetin gönderim anı var; yanıt anı ancak ve ancak
--     RESPONDED'da; FAILED'de hata kodu) → crm_survey_invitations_state_check.
--   * Davet açılırken alıcı (aday ya da kurum) zorunlu → crm_survey_invitations_guard. Yalnız EKLEMEDE: aday
--     silinince FK `on delete set null` bağı boşaltır, davet ve yanıt (ad / kurum adıyla) kalır.
--   * Token ve anket değiştirilemez; RESPONDED son durumdur (geri dönmez) → crm_survey_invitations_guard.
--   * NPS 0–10, memnuniyet 1–5, yorum 1–2000 karakter; yanıt boş olamaz.
--
-- GÜVENLİK: RLS açık, POLİTİKA YOK → yalnız service_role. Fonksiyonlar PUBLIC'ten geri alındı. Herkese açık uçlar
-- (/api/public/surveys/*) da sunucuda service_role ile yalnız crm_survey_open / crm_survey_submit'i çağırır; tarayıcı
-- tablolara hiç erişemez. Kişisel veri: Ayarlar → KVKK envanterinde "Anket davetleri" ve "Anket yanıtları".
-- Geri almak: dosyanın sonundaki "GERİ ALMA" bloğu.
--
-- UYGULANDI: 2026-09-29, CRM projesine Supabase MCP apply_migration ile (ad: crm_surveys); dış
-- begin/commit çıkarılarak gönderildi.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1) Anketler
-- -----------------------------------------------------------------------------

-- Soru listesi doğrulaması (CHECK içinden). CASE sırası korunur: dizi olmayan girdi jsonb_array_elements'a ulaşmaz.
create or replace function public.crm_survey_questions_valid(p jsonb)
returns boolean
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select case
    when p is null or jsonb_typeof(p) <> 'array' then false
    when jsonb_array_length(p) not between 1 and 20 then false
    when exists (select 1 from jsonb_array_elements(p) q where jsonb_typeof(q) <> 'object') then false
    else not exists (
           select 1
             from jsonb_array_elements(p) q
            where coalesce(q->>'id', '') !~ '^[a-z][a-z0-9_]{0,39}$'
               or coalesce(q->>'type', '') not in ('NPS', 'CSAT', 'COMMENT')
               or coalesce(jsonb_typeof(q->'required'), '') <> 'boolean'
               or coalesce(jsonb_typeof(q->'text'), 'null') not in ('string', 'null')
               or coalesce(length(q->>'text'), 0) > 300
         )
         and (
           select count(distinct q->>'type') = count(*) and count(distinct q->>'id') = count(*)
             from jsonb_array_elements(p) q
         )
  end;
$$;

create table if not exists public.crm_surveys (
  id uuid primary key default gen_random_uuid(),
  -- Kalıcı ad (varsayılan: DEFAULT_NPS_CSAT).
  code text not null,
  title text not null,
  intro text,
  -- [{ id, type: NPS|CSAT|COMMENT, text, required }]
  questions jsonb not null,
  is_default boolean not null default false,
  -- Davet linkinin geçerlilik süresi (gün).
  link_valid_days integer not null default 30,
  created_at timestamptz not null default now(),
  constraint crm_surveys_code_key unique (code),
  constraint crm_surveys_code_check check (code ~ '^[A-Z][A-Z0-9_]{0,59}$'),
  constraint crm_surveys_title_check check (length(btrim(title)) between 1 and 200),
  constraint crm_surveys_intro_check check (intro is null or length(btrim(intro)) between 1 and 1000),
  constraint crm_surveys_questions_check check (public.crm_survey_questions_valid(questions)),
  constraint crm_surveys_link_valid_days_check check (link_valid_days between 1 and 365)
);

comment on table public.crm_surveys is
  'EdorasCRM memnuniyet anketleri (tanım). En çok bir varsayılan. Yalnız service_role.';

-- En çok bir varsayılan anket.
create unique index if not exists crm_surveys_default_key on public.crm_surveys (is_default) where is_default;

-- Varsayılan anket (DeepSport DEFAULT_SURVEY, Edoras diliyle: kurum; antrenör / sporcu yok).
insert into public.crm_surveys (code, title, intro, questions, is_default, link_valid_days)
values (
  'DEFAULT_NPS_CSAT',
  'Edoras memnuniyet anketi',
  'Kurumunuzun Edoras deneyimini merak ediyoruz. Anket yaklaşık 1 dakika sürer.',
  jsonb_build_array(
    jsonb_build_object(
      'id', 'nps', 'type', 'NPS', 'required', true,
      'text', 'Edoras''ı başka bir kuruma ya da bir meslektaşınıza tavsiye etme olasılığınız nedir?'
    ),
    jsonb_build_object(
      'id', 'csat', 'type', 'CSAT', 'required', true,
      'text', 'Kurumunuz olarak Edoras''tan genel olarak ne kadar memnunsunuz?'
    ),
    jsonb_build_object(
      'id', 'comment', 'type', 'COMMENT', 'required', false,
      'text', 'Eklemek istediğiniz bir şey var mı?'
    )
  ),
  true,
  30
)
on conflict (code) do nothing;

-- -----------------------------------------------------------------------------
-- 2) Davetler
-- -----------------------------------------------------------------------------

create table if not exists public.crm_survey_invitations (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.crm_surveys(id) on delete restrict,
  -- Kişiye özel link anahtarı: sunucuda üretilir (crypto.randomBytes(32) → base64url, 43 karakter).
  token text not null,
  lead_id uuid references public.crm_leads(id) on delete set null,
  -- Edoras (bmjkpxbrmwxuildwakly) public.institutions.id — başka veritabanı, FK yok.
  institution_id uuid,
  -- Davet anındaki alıcı bilgisi (aday / kurum kaydı sonradan değişse de davet ne gönderildiyse onu gösterir).
  recipient_name text,
  organization_name text,
  email text,
  phone text,
  channel text not null,
  status text not null default 'CREATED',
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  opened_at timestamptz,
  responded_at timestamptz,
  expires_at timestamptz not null,
  created_by uuid references auth.users(id) on delete set null,
  -- Son gönderim hatasının kısa kodu (ör. resend:422) — sağlayıcı mesajı ve adres yazılmaz.
  error text,
  constraint crm_survey_invitations_token_key unique (token),
  constraint crm_survey_invitations_token_check check (token ~ '^[A-Za-z0-9_-]{43,128}$'),
  constraint crm_survey_invitations_channel_check check (channel in ('EMAIL', 'WHATSAPP', 'SMS', 'LINK')),
  constraint crm_survey_invitations_status_check check (
    status in ('CREATED', 'SENT', 'OPENED', 'RESPONDED', 'EXPIRED', 'FAILED')
  ),
  constraint crm_survey_invitations_email_check check (
    email is null or (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and email = lower(email))
  ),
  constraint crm_survey_invitations_phone_check check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
  -- Kanalın gerektirdiği iletişim: e-postada e-posta, WhatsApp / SMS'te telefon.
  constraint crm_survey_invitations_contact_check check (
    (channel <> 'EMAIL' or email is not null)
    and (channel not in ('WHATSAPP', 'SMS') or phone is not null)
  ),
  -- Durum ↔ anlar: gönderilen / açılan / yanıtlanan davetin gönderim anı, açılan / yanıtlananın açılma anı var;
  -- yanıt anı ancak ve ancak RESPONDED'da; FAILED'de hata kodu.
  constraint crm_survey_invitations_state_check check (
    (status not in ('SENT', 'OPENED', 'RESPONDED') or sent_at is not null)
    and (status not in ('OPENED', 'RESPONDED') or opened_at is not null)
    and ((status = 'RESPONDED') = (responded_at is not null))
    and (status <> 'FAILED' or error is not null)
  ),
  constraint crm_survey_invitations_expires_check check (expires_at > created_at),
  constraint crm_survey_invitations_length_check check (
    coalesce(length(recipient_name), 0) <= 200
    and coalesce(length(organization_name), 0) <= 200
    and coalesce(length(email), 0) <= 254
    and coalesce(length(error), 0) <= 200
  )
);

comment on table public.crm_survey_invitations is
  'EdorasCRM anket davetleri (kişisel veri: alıcı adı, kurum, e-posta, telefon). Token tahmin edilemez; yalnız '
  'service_role. Aday silinince bağ boşalır, davet kalır.';
comment on column public.crm_survey_invitations.institution_id is
  'Edoras (bmjkpxbrmwxuildwakly) public.institutions.id — başka veritabanı, FK yok.';

create index if not exists crm_survey_invitations_survey_idx on public.crm_survey_invitations (survey_id, created_at desc);
create index if not exists crm_survey_invitations_lead_idx
  on public.crm_survey_invitations (lead_id, created_at desc) where lead_id is not null;
create index if not exists crm_survey_invitations_institution_idx
  on public.crm_survey_invitations (institution_id, created_at desc) where institution_id is not null;
-- Görevlerim (anket araması): gönderilmiş / açılmış, yanıt bekleyen davetler.
create index if not exists crm_survey_invitations_awaiting_idx
  on public.crm_survey_invitations (sent_at) where status in ('SENT', 'OPENED');

-- Boş metin → null; eklemede alıcı zorunlu; token ve anket değişmez; RESPONDED son durumdur.
-- CHECK'ler bu düzeltmeden SONRA değerlendirilir.
create or replace function public.crm_survey_invitations_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  new.recipient_name := nullif(btrim(regexp_replace(new.recipient_name, '\s+', ' ', 'g')), '');
  new.organization_name := nullif(btrim(regexp_replace(new.organization_name, '\s+', ' ', 'g')), '');
  new.email := nullif(btrim(new.email), '');
  new.phone := nullif(btrim(new.phone), '');
  new.error := nullif(btrim(new.error), '');

  if tg_op = 'INSERT' then
    if new.lead_id is null and new.institution_id is null then
      raise exception 'CRM_SURVEY_RECIPIENT_REQUIRED' using hint = 'Davet bir CRM adayına ya da kuruma açılır.';
    end if;
  else
    if new.token <> old.token or new.survey_id <> old.survey_id then
      raise exception 'CRM_SURVEY_INVALID' using hint = 'Davetin linki ve anketi değiştirilemez.';
    end if;
    if old.status = 'RESPONDED' and new.status <> 'RESPONDED' then
      raise exception 'CRM_SURVEY_ANSWERED' using hint = 'Yanıtlanmış davet geri alınamaz.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists crm_survey_invitations_guard on public.crm_survey_invitations;
create trigger crm_survey_invitations_guard
  before insert or update on public.crm_survey_invitations
  for each row execute function public.crm_survey_invitations_guard();

-- -----------------------------------------------------------------------------
-- 3) Yanıtlar — davet başına en çok bir yanıt; davet silinirse yanıtı da silinir.
-- -----------------------------------------------------------------------------

create table if not exists public.crm_survey_responses (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.crm_surveys(id) on delete restrict,
  invitation_id uuid not null references public.crm_survey_invitations(id) on delete cascade,
  lead_id uuid references public.crm_leads(id) on delete set null,
  -- Edoras institutions.id — başka veritabanı, FK yok.
  institution_id uuid,
  nps smallint,
  csat smallint,
  comment text,
  created_at timestamptz not null default now(),
  constraint crm_survey_responses_invitation_key unique (invitation_id),
  constraint crm_survey_responses_nps_check check (nps is null or nps between 0 and 10),
  constraint crm_survey_responses_csat_check check (csat is null or csat between 1 and 5),
  constraint crm_survey_responses_comment_check check (comment is null or length(comment) between 1 and 2000),
  constraint crm_survey_responses_answer_check check (nps is not null or csat is not null or comment is not null)
);

comment on table public.crm_survey_responses is
  'EdorasCRM anket yanıtları (müşterinin kendi puanı ve yorumu). Davet başına bir yanıt. Yalnız service_role.';

create index if not exists crm_survey_responses_survey_idx on public.crm_survey_responses (survey_id, created_at desc);
create index if not exists crm_survey_responses_lead_idx
  on public.crm_survey_responses (lead_id, created_at desc) where lead_id is not null;
create index if not exists crm_survey_responses_institution_idx
  on public.crm_survey_responses (institution_id, created_at desc) where institution_id is not null;

-- -----------------------------------------------------------------------------
-- 4) Davet, açılış ve yanıt — her biri tek transaction. Çağıran: EdorasCRM sunucusu (service_role).
-- -----------------------------------------------------------------------------

-- Davet açar ya da mevcut daveti döndürür → { "id": uuid, "reused": boolean }.
-- Aynı alıcı (aynı aday ya da aynı kurum) için son 7 günde açılmış, yanıtlanmamış (CREATED / SENT / OPENED) ve süresi
-- dolmamış bir davet varsa yenisi AÇILMAZ (kanal fark etmez). Alıcı başına danışma kilidi: eşzamanlı iki istek iki
-- davet açamaz. Sunucu alıcı bilgisini (ad, e-posta, telefon) adaydan / kurum kaydından kendisi okur.
create or replace function public.crm_create_survey_invitation(
  p_survey_id uuid,
  p_token text,
  p_lead_id uuid,
  p_institution_id uuid,
  p_recipient_name text,
  p_organization_name text,
  p_email text,
  p_phone text,
  p_channel text,
  p_actor uuid
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_days integer;
  v_id uuid;
begin
  if p_actor is null then
    raise exception 'CRM_SURVEY_ACTOR_REQUIRED';
  end if;
  if p_lead_id is null and p_institution_id is null then
    raise exception 'CRM_SURVEY_RECIPIENT_REQUIRED';
  end if;
  select s.link_valid_days into v_days from public.crm_surveys s where s.id = p_survey_id;
  if not found then
    raise exception 'CRM_SURVEY_NOT_FOUND';
  end if;
  if p_lead_id is not null and not exists (select 1 from public.crm_leads l where l.id = p_lead_id) then
    raise exception 'CRM_SURVEY_LEAD_NOT_FOUND';
  end if;

  perform pg_advisory_xact_lock(hashtext('crm_survey_invitation:' || coalesce(p_lead_id, p_institution_id)::text));

  select i.id into v_id
    from public.crm_survey_invitations i
   where i.survey_id = p_survey_id
     and (
       (p_lead_id is not null and i.lead_id = p_lead_id)
       or (p_institution_id is not null and i.institution_id = p_institution_id)
     )
     and i.status in ('CREATED', 'SENT', 'OPENED')
     and i.expires_at > now()
     and i.created_at > now() - interval '7 days'
   order by i.created_at desc
   limit 1;
  if found then
    return jsonb_build_object('id', v_id, 'reused', true);
  end if;

  insert into public.crm_survey_invitations (
    survey_id, token, lead_id, institution_id, recipient_name, organization_name, email, phone,
    channel, status, expires_at, created_by
  )
  values (
    p_survey_id, p_token, p_lead_id, p_institution_id, p_recipient_name, p_organization_name, p_email, p_phone,
    p_channel, 'CREATED', now() + make_interval(days => v_days), p_actor
  )
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'reused', false);
end;
$$;

-- Herkese açık sayfa açılışı → { state: NOT_FOUND | ANSWERED | EXPIRED | OPEN, … }. OPEN'da anket başlığı, giriş metni,
-- sorular ve alıcı adı (sunucu yalnız ilk adı gösterir) döner; başka hiçbir alan dönmez.
-- İlk açılışta davet OPENED olur (bir kez); gönderim anı yoksa (personel "gönderdim" demeden müşteri açtıysa) açılış
-- anı yazılır. Süresi dolan davet burada tembelce EXPIRED yazılır (zamanlayıcı yok).
create or replace function public.crm_survey_open(p_token text)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_inv public.crm_survey_invitations%rowtype;
  v_survey public.crm_surveys%rowtype;
begin
  select * into v_inv from public.crm_survey_invitations i where i.token = p_token for update;
  if not found then
    return jsonb_build_object('state', 'NOT_FOUND');
  end if;
  if v_inv.status = 'RESPONDED' then
    return jsonb_build_object('state', 'ANSWERED');
  end if;
  if v_inv.status = 'EXPIRED' or v_inv.expires_at <= now() then
    if v_inv.status <> 'EXPIRED' then
      update public.crm_survey_invitations set status = 'EXPIRED' where id = v_inv.id;
    end if;
    return jsonb_build_object('state', 'EXPIRED');
  end if;

  if v_inv.opened_at is null then
    update public.crm_survey_invitations
       set status = 'OPENED', opened_at = now(), sent_at = coalesce(sent_at, now())
     where id = v_inv.id;
  end if;

  select * into v_survey from public.crm_surveys s where s.id = v_inv.survey_id;
  return jsonb_build_object(
    'state', 'OPEN',
    'title', v_survey.title,
    'intro', v_survey.intro,
    'questions', v_survey.questions,
    'recipient_name', v_inv.recipient_name
  );
end;
$$;

-- Herkese açık yanıt. Token geçersiz → CRM_SURVEY_NOT_FOUND; süresi dolmuş → CRM_SURVEY_EXPIRED; zaten yanıtlanmış
-- (eşzamanlı ikinci yanıt dahil) → CRM_SURVEY_ANSWERED; ankette olmayan soruya yanıt, aralık dışı puan, 2000'i aşan
-- yorum, boş zorunlu soru ya da tamamen boş yanıt → CRM_SURVEY_ANSWER_INVALID. Yanıt + davetin RESPONDED olması tek
-- transaction.
create or replace function public.crm_survey_submit(p_token text, p_nps integer, p_csat integer, p_comment text)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_inv public.crm_survey_invitations%rowtype;
  v_questions jsonb;
  v_comment text := nullif(btrim(p_comment), '');
  v_id uuid;
  v_has_nps boolean;
  v_has_csat boolean;
  v_has_comment boolean;
  v_req_nps boolean;
  v_req_csat boolean;
  v_req_comment boolean;
begin
  select * into v_inv from public.crm_survey_invitations i where i.token = p_token for update;
  if not found then
    raise exception 'CRM_SURVEY_NOT_FOUND';
  end if;
  if v_inv.status = 'RESPONDED' then
    raise exception 'CRM_SURVEY_ANSWERED';
  end if;
  if v_inv.status = 'EXPIRED' or v_inv.expires_at <= now() then
    raise exception 'CRM_SURVEY_EXPIRED';
  end if;

  select s.questions into v_questions from public.crm_surveys s where s.id = v_inv.survey_id;
  select
    coalesce(bool_or(q->>'type' = 'NPS'), false),
    coalesce(bool_or(q->>'type' = 'CSAT'), false),
    coalesce(bool_or(q->>'type' = 'COMMENT'), false),
    coalesce(bool_or(q->>'type' = 'NPS' and (q->>'required')::boolean), false),
    coalesce(bool_or(q->>'type' = 'CSAT' and (q->>'required')::boolean), false),
    coalesce(bool_or(q->>'type' = 'COMMENT' and (q->>'required')::boolean), false)
    into v_has_nps, v_has_csat, v_has_comment, v_req_nps, v_req_csat, v_req_comment
    from jsonb_array_elements(v_questions) q;

  if (p_nps is not null and (not v_has_nps or p_nps not between 0 and 10))
     or (p_csat is not null and (not v_has_csat or p_csat not between 1 and 5))
     or (v_comment is not null and (not v_has_comment or length(v_comment) > 2000))
     or (p_nps is null and v_req_nps)
     or (p_csat is null and v_req_csat)
     or (v_comment is null and v_req_comment)
     or (p_nps is null and p_csat is null and v_comment is null) then
    raise exception 'CRM_SURVEY_ANSWER_INVALID';
  end if;

  begin
    insert into public.crm_survey_responses (survey_id, invitation_id, lead_id, institution_id, nps, csat, comment)
    values (v_inv.survey_id, v_inv.id, v_inv.lead_id, v_inv.institution_id, p_nps, p_csat, v_comment)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'CRM_SURVEY_ANSWERED';
  end;

  update public.crm_survey_invitations
     set status = 'RESPONDED',
         responded_at = now(),
         opened_at = coalesce(opened_at, now()),
         sent_at = coalesce(sent_at, now())
   where id = v_inv.id;
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5) Yetkiler — yalnız service_role
-- -----------------------------------------------------------------------------

alter table public.crm_surveys enable row level security;
alter table public.crm_survey_invitations enable row level security;
alter table public.crm_survey_responses enable row level security;

revoke all on table public.crm_surveys, public.crm_survey_invitations, public.crm_survey_responses
  from public, anon, authenticated;
grant select, insert, update, delete on table
  public.crm_surveys, public.crm_survey_invitations, public.crm_survey_responses
  to service_role;

revoke execute on function
  public.crm_survey_questions_valid(jsonb),
  public.crm_survey_invitations_guard(),
  public.crm_create_survey_invitation(uuid, text, uuid, uuid, text, text, text, text, text, uuid),
  public.crm_survey_open(text),
  public.crm_survey_submit(text, integer, integer, text)
  from public, anon, authenticated;

-- crm_survey_questions_valid CHECK içinden service_role olarak çağrılır.
grant execute on function
  public.crm_survey_questions_valid(jsonb),
  public.crm_create_survey_invitation(uuid, text, uuid, uuid, text, text, text, text, text, uuid),
  public.crm_survey_open(text),
  public.crm_survey_submit(text, integer, integer, text)
  to service_role;

commit;

-- =============================================================================
-- GERİ ALMA (anketler, davetler ve yanıtlar silinir; tamamlanan "Anket araması" görevleri crm_tasks'ta kalır):
--   begin;
--   drop function if exists public.crm_survey_submit(text, integer, integer, text);
--   drop function if exists public.crm_survey_open(text);
--   drop function if exists public.crm_create_survey_invitation(uuid, text, uuid, uuid, text, text, text, text, text, uuid);
--   drop table if exists public.crm_survey_responses, public.crm_survey_invitations, public.crm_surveys;
--   drop function if exists public.crm_survey_invitations_guard(), public.crm_survey_questions_valid(jsonb);
--   commit;
-- =============================================================================
