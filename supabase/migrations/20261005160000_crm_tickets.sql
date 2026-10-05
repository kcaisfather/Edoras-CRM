-- =============================================================================
-- EdorasCRM · 20261005160000 — destek talepleri (ticket)
--
-- NEREYE: EdorasCRM'in kendi Supabase projesi (orishbqniebbgdanazrp). Edoras'a dokunmaz.
-- NEDEN: Kuruma bağlı destek talepleri; ekip hem kendisi açar hem müşteri herkese açık sayfadan (token'lı bağlantı)
--        açar. Anketlerdeki güvenlik modelinin aynısı: oturum yok, yalnız token, dar RPC'ler.
--
--   * crm_ticket_links: kurum başına TEK destek bağlantısı (token). Yenilenince eski bağlantı geçersiz olur.
--   * crm_tickets: durum (OPEN / PENDING / RESOLVED), öncelik, kaynak (STAFF / PORTAL), sorumlu (aktif personel),
--     talep eden (ad + e-posta ve / veya telefon — KİŞİSEL VERİ: işlem kaydına yazılmaz). RESOLVED ⇔ resolved_at.
--   * crm_ticket_notes: ekip notları (yalnız ekibe görünür).
--   * crm_ticket_portal_open / _create: müşteri tarafı. Açılışta yalnız kurum adı döner; oluşturmada token, alan
--     doğrulaması ve kurum başına 24 saatte en çok 20 portal talebi sınırı (spam) zorunlu.
--
-- GÜVENLİK: RLS açık; tablolar yalnız service_role. RPC'ler PUBLIC / anon / authenticated'dan geri alındı (müşteri
-- yolu da sunucudan service_role ile çağırır; tarayıcıya anahtar gitmez).
-- Geri almak: dosyanın sonundaki "GERİ ALMA" bloğu.
-- =============================================================================

begin;

create table if not exists public.crm_ticket_links (
  institution_id uuid primary key references public.crm_institutions(institution_id) on delete cascade,
  token text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint crm_ticket_links_token_key unique (token),
  constraint crm_ticket_links_token_check check (token ~ '^[A-Za-z0-9_-]{43,128}$')
);

create table if not exists public.crm_tickets (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity,
  institution_id uuid not null references public.crm_institutions(institution_id) on delete cascade,
  subject text not null,
  description text,
  status text not null default 'OPEN',
  priority text not null default 'NORMAL',
  source text not null default 'STAFF',
  assignee_id uuid references public.crm_staff(user_id) on delete set null,
  requester_name text,
  requester_email text,
  requester_phone text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint crm_tickets_number_key unique (number),
  constraint crm_tickets_status_check check (status in ('OPEN', 'PENDING', 'RESOLVED')),
  constraint crm_tickets_priority_check check (priority in ('LOW', 'NORMAL', 'HIGH')),
  constraint crm_tickets_source_check check (source in ('STAFF', 'PORTAL')),
  constraint crm_tickets_resolved_check check ((status = 'RESOLVED') = (resolved_at is not null)),
  constraint crm_tickets_subject_check check (length(subject) between 3 and 150),
  constraint crm_tickets_description_check check (description is null or length(description) <= 4000),
  constraint crm_tickets_requester_check check (
    coalesce(length(requester_name), 0) <= 100 and coalesce(length(requester_email), 0) <= 254 and coalesce(length(requester_phone), 0) <= 30
  ),
  constraint crm_tickets_email_check check (requester_email is null or requester_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  -- Portal talebinde talep eden ad ve en az bir iletişim yolu zorunlu.
  constraint crm_tickets_portal_contact_check check (
    source <> 'PORTAL' or (requester_name is not null and (requester_email is not null or requester_phone is not null))
  )
);

create index if not exists crm_tickets_institution_idx on public.crm_tickets (institution_id, created_at desc);
create index if not exists crm_tickets_open_idx on public.crm_tickets (status, created_at desc) where status <> 'RESOLVED';
create index if not exists crm_tickets_assignee_idx on public.crm_tickets (assignee_id) where assignee_id is not null;

create table if not exists public.crm_ticket_notes (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.crm_tickets(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  author_name text,
  body text not null,
  created_at timestamptz not null default now(),
  constraint crm_ticket_notes_body_check check (length(btrim(body)) between 1 and 4000)
);

create index if not exists crm_ticket_notes_ticket_idx on public.crm_ticket_notes (ticket_id, created_at);

comment on table public.crm_tickets is
  'EdorasCRM destek talepleri. requester_* kişisel veridir (işlem kaydına yazılmaz). Yalnız service_role.';

create or replace function public.crm_tickets_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.subject := btrim(regexp_replace(new.subject, '\s+', ' ', 'g'));
  new.description := nullif(btrim(new.description), '');
  new.requester_name := nullif(btrim(regexp_replace(new.requester_name, '\s+', ' ', 'g')), '');
  new.requester_email := lower(nullif(btrim(new.requester_email), ''));
  new.requester_phone := nullif(btrim(new.requester_phone), '');

  -- Çözüm anı durumdan türer: RESOLVED'a geçişte yazılır, çıkışta silinir.
  if new.status = 'RESOLVED' then
    new.resolved_at := case when tg_op = 'UPDATE' and old.status = 'RESOLVED' then old.resolved_at else now() end;
  else
    new.resolved_at := null;
  end if;

  if new.assignee_id is not null
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id)
     and not exists (select 1 from public.crm_staff s where s.user_id = new.assignee_id and s.is_active) then
    raise exception 'CRM_TICKET_ASSIGNEE_INVALID' using hint = 'Talep yalnız aktif CRM personeline atanır.';
  end if;

  return new;
end;
$$;

drop trigger if exists crm_tickets_guard on public.crm_tickets;
create trigger crm_tickets_guard
  before insert or update on public.crm_tickets
  for each row execute function public.crm_tickets_guard();

drop trigger if exists crm_tickets_touch on public.crm_tickets;
create trigger crm_tickets_touch
  before update on public.crm_tickets
  for each row execute function public.crm_touch_updated_at();

-- -----------------------------------------------------------------------------
-- Müşteri tarafı (herkese açık sayfa): yalnız token ile
-- -----------------------------------------------------------------------------

create or replace function public.crm_ticket_portal_open(p_token text)
returns jsonb
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_name text;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43,128}$' then
    return jsonb_build_object('state', 'NOT_FOUND');
  end if;
  select i.institution_name into v_name
    from public.crm_ticket_links l
    join public.crm_institutions i on i.institution_id = l.institution_id
   where l.token = p_token;
  if not found then
    return jsonb_build_object('state', 'NOT_FOUND');
  end if;
  return jsonb_build_object('state', 'OPEN', 'institution_name', v_name);
end;
$$;

create or replace function public.crm_ticket_portal_create(
  p_token text,
  p_subject text,
  p_description text,
  p_name text,
  p_email text,
  p_phone text
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_institution uuid;
  v_number bigint;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43,128}$' then
    raise exception 'CRM_TICKET_LINK_NOT_FOUND';
  end if;
  select l.institution_id into v_institution from public.crm_ticket_links l where l.token = p_token;
  if not found then
    raise exception 'CRM_TICKET_LINK_NOT_FOUND';
  end if;

  if length(btrim(coalesce(p_subject, ''))) < 3 or length(btrim(p_subject)) > 150
     or length(btrim(coalesce(p_name, ''))) < 2 or length(btrim(p_name)) > 100
     or length(coalesce(p_description, '')) > 4000 then
    raise exception 'CRM_TICKET_INVALID';
  end if;
  if nullif(btrim(coalesce(p_email, '')), '') is null and nullif(btrim(coalesce(p_phone, '')), '') is null then
    raise exception 'CRM_TICKET_CONTACT_REQUIRED';
  end if;

  -- Kurum başına 24 saatte en çok 20 portal talebi (spam sınırı; IP sınırı sunucuda).
  perform pg_advisory_xact_lock(hashtext('crm_ticket_portal:' || v_institution::text));
  if (select count(*) from public.crm_tickets t
       where t.institution_id = v_institution and t.source = 'PORTAL' and t.created_at > now() - interval '24 hours') >= 20 then
    raise exception 'CRM_TICKET_RATE_LIMITED';
  end if;

  insert into public.crm_tickets (institution_id, subject, description, source, requester_name, requester_email, requester_phone)
  values (v_institution, p_subject, p_description, 'PORTAL', p_name, p_email, p_phone)
  returning number into v_number;

  return jsonb_build_object('number', v_number);
end;
$$;

-- -----------------------------------------------------------------------------
-- Yetkiler — yalnız service_role
-- -----------------------------------------------------------------------------

alter table public.crm_ticket_links enable row level security;
alter table public.crm_tickets enable row level security;
alter table public.crm_ticket_notes enable row level security;

revoke all on table public.crm_ticket_links, public.crm_tickets, public.crm_ticket_notes from public, anon, authenticated;
grant select, insert, update, delete on table public.crm_ticket_links, public.crm_tickets, public.crm_ticket_notes to service_role;

revoke execute on function public.crm_tickets_guard() from public, anon, authenticated;
revoke execute on function public.crm_ticket_portal_open(text), public.crm_ticket_portal_create(text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.crm_ticket_portal_open(text), public.crm_ticket_portal_create(text, text, text, text, text, text)
  to service_role;

commit;

-- =============================================================================
-- GERİ ALMA (talepler, notlar ve bağlantılar silinir):
--   begin;
--   drop function if exists public.crm_ticket_portal_create(text, text, text, text, text, text);
--   drop function if exists public.crm_ticket_portal_open(text);
--   drop table if exists public.crm_ticket_notes, public.crm_tickets, public.crm_ticket_links;
--   drop function if exists public.crm_tickets_guard();
--   commit;
-- =============================================================================
