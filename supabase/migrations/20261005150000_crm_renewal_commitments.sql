-- =============================================================================
-- EdorasCRM · 20261005150000 — yenileme taahhüdü (crm_renewal_commitments)
--
-- NEREYE: EdorasCRM'in kendi Supabase projesi (orishbqniebbgdanazrp). Edoras'a dokunmaz.
-- NEDEN: Yenileme Radarı — süresi dolmak üzere olan kurumun yenileme niyeti (Yenileyecek / Kararsız / Yenilemeyecek)
--        ve kısa not, ekipçe paylaşılır; risk altındaki bedel buradan hesaplanır.
--
--   * Kurum başına tek satır. `cycle_end` taahhüdün geçerli olduğu bitiş günüdür (lisans / demo bitişi): kurum
--     yenilenip bitiş değişince taahhüt kendiliğinden geçersiz sayılır (okurken karşılaştırılır; silmek gerekmez).
--   * institution_id Edoras institutions.id ile aynı (başka veritabanı) — crm_institutions gibi yumuşak referans, FK yok.
--     Kurumun CRM'de kayıtlı olduğu sunucuda doğrulanır; kurum kaydı silinirse satır zararsız kalır.
--   * Not kişisel veri taşımaz (kısa iş notu); işlem kaydına yazılmaz.
--
-- GÜVENLİK: RLS açık, yalnız service_role.
-- Geri almak: dosyanın sonundaki "GERİ ALMA" bloğu.
-- =============================================================================

begin;

create table if not exists public.crm_renewal_commitments (
  institution_id uuid primary key,
  cycle_end date not null,
  status text not null,
  note text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint crm_renewal_commitments_status_check check (status in ('WILL_RENEW', 'UNDECIDED', 'WILL_CHURN')),
  constraint crm_renewal_commitments_note_check check (note is null or length(note) between 1 and 500)
);

comment on table public.crm_renewal_commitments is
  'Yenileme Radarı taahhüdü: kurum başına yenileme niyeti. cycle_end değişince geçersiz sayılır. Yalnız service_role.';

create or replace function public.crm_renewal_commitments_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  new.note := nullif(btrim(new.note), '');
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists crm_renewal_commitments_guard on public.crm_renewal_commitments;
create trigger crm_renewal_commitments_guard
  before insert or update on public.crm_renewal_commitments
  for each row execute function public.crm_renewal_commitments_guard();

alter table public.crm_renewal_commitments enable row level security;
revoke all on table public.crm_renewal_commitments from public, anon, authenticated;
grant select, insert, update, delete on table public.crm_renewal_commitments to service_role;
revoke execute on function public.crm_renewal_commitments_guard() from public, anon, authenticated;

commit;

-- =============================================================================
-- GERİ ALMA (taahhütler silinir):
--   begin;
--   drop table if exists public.crm_renewal_commitments;
--   drop function if exists public.crm_renewal_commitments_guard();
--   commit;
-- =============================================================================
