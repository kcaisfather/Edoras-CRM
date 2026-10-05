-- =============================================================================
-- EdorasCRM · 20261005130000 — randevular (crm_appointments)
--
-- NEREYE: EdorasCRM'in kendi Supabase projesi (orishbqniebbgdanazrp). Edoras'a dokunmaz.
-- NEDEN: Adayla planlanan görüşme (tarih + saat, Online / Yüz yüze, link ya da yer) görev notuna gömülmez,
--        kendi tablosunda durur: yeniden planlama, iptal ve sonuç (Gerçekleşti / Gelmedi) raporlanabilir olur.
--
--   * starts_at: zaman damgası (Türkiye UTC+3 sabit; sunucu İstanbul saatinden çevirir).
--   * mode ONLINE → yalnız link (http/https), IN_PERSON → yalnız location.
--   * status: SCHEDULED (açık) → HELD / NO_SHOW / CANCELLED (kapalı, resolved_at dolu). Kapanan randevu değişmez.
--   * Tetikleyici: yeni randevu ya da saat değişikliği geçmişe olamaz (5 dk saat farkı payı); atanan aktif
--     CRM personeli olmalı.
--
-- GÜVENLİK: RLS açık, yalnız service_role. Tetikleyici fonksiyonu PUBLIC'ten geri alındı.
-- Geri almak: dosyanın sonundaki "GERİ ALMA" bloğu.
-- =============================================================================

begin;

create table if not exists public.crm_appointments (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.crm_leads(id) on delete cascade,
  starts_at timestamptz not null,
  mode text not null,
  link text,
  location text,
  note text,
  status text not null default 'SCHEDULED',
  assignee_id uuid references public.crm_staff(user_id) on delete set null,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_appointments_mode_check check (mode in ('ONLINE', 'IN_PERSON')),
  constraint crm_appointments_status_check check (status in ('SCHEDULED', 'HELD', 'NO_SHOW', 'CANCELLED')),
  constraint crm_appointments_where_check check (
    case mode
      when 'ONLINE' then location is null
      else link is null
    end
  ),
  constraint crm_appointments_link_check check (link is null or link ~* '^https?://[^\s]+$'),
  constraint crm_appointments_length_check check (
    coalesce(length(link), 0) <= 500 and coalesce(length(location), 0) <= 300 and coalesce(length(note), 0) <= 2000
  ),
  constraint crm_appointments_resolved_check check ((status = 'SCHEDULED') = (resolved_at is null))
);

comment on table public.crm_appointments is
  'EdorasCRM randevuları (aday görüşmeleri). Yalnız service_role.';

create index if not exists crm_appointments_lead_idx on public.crm_appointments (lead_id, starts_at);
create index if not exists crm_appointments_open_idx on public.crm_appointments (starts_at) where status = 'SCHEDULED';
create index if not exists crm_appointments_assignee_idx on public.crm_appointments (assignee_id) where assignee_id is not null;

create or replace function public.crm_appointments_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.link := nullif(btrim(new.link), '');
  new.location := nullif(btrim(new.location), '');
  new.note := nullif(btrim(new.note), '');

  if tg_op = 'UPDATE' and old.status <> 'SCHEDULED' then
    raise exception 'CRM_APPOINTMENT_CLOSED' using hint = 'Kapanmış randevu değiştirilemez.';
  end if;

  if (tg_op = 'INSERT' or new.starts_at is distinct from old.starts_at)
     and new.starts_at < now() - interval '5 minutes' then
    raise exception 'CRM_APPOINTMENT_PAST' using hint = 'Randevu geçmişe planlanamaz.';
  end if;

  if new.assignee_id is not null
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id)
     and not exists (select 1 from public.crm_staff s where s.user_id = new.assignee_id and s.is_active) then
    raise exception 'CRM_APPOINTMENT_ASSIGNEE_INVALID' using hint = 'Randevu yalnız aktif CRM personeline atanır.';
  end if;

  return new;
end;
$$;

drop trigger if exists crm_appointments_guard on public.crm_appointments;
create trigger crm_appointments_guard
  before insert or update on public.crm_appointments
  for each row execute function public.crm_appointments_guard();

drop trigger if exists crm_appointments_touch on public.crm_appointments;
create trigger crm_appointments_touch
  before update on public.crm_appointments
  for each row execute function public.crm_touch_updated_at();

alter table public.crm_appointments enable row level security;
revoke all on table public.crm_appointments from public, anon, authenticated;
grant select, insert, update, delete on table public.crm_appointments to service_role;
revoke execute on function public.crm_appointments_guard() from public, anon, authenticated;

commit;

-- =============================================================================
-- GERİ ALMA (randevu kayıtları silinir):
--   begin;
--   drop table if exists public.crm_appointments;
--   drop function if exists public.crm_appointments_guard();
--   commit;
-- =============================================================================
