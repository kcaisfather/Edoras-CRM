-- =============================================================================
-- EdorasCRM · 20260929170000 — Görevler (crm_tasks) ve takip kuralları (crm_rules)
--
-- NEREYE: EdorasCRM'in kendi Supabase projesi (orishbqniebbgdanazrp). Edoras'a dokunmaz.
--
-- DeepSportAdmin "Görevlerim + kural motoru" sözleşmesinin (docs/backend-requests.md → Madde 11–12
-- CRM_TASKS / CRM_RULES) gerçek tablo karşılığı. DeepSport'ta bayrak kapalıyken tarayıcıda (localStorage)
-- tutulan tamamlanma bilgisi, kurallar ve `[GOREV|…]` / `[ATAMA|…]` not önekleri yerine:
--   * Zamanlayıcı (cron) YOK. Açık kural görevleri tabloya önceden yazılmaz; her istekte sunucuda adaylardan,
--     kurum kayıtlarından, lisanslardan, ödemelerden ve kurallardan TÜRETİLİR (lib/domain/tasks/derive.ts).
--     Tabloya yalnız şunlar yazılır:
--       - elle atanan görevler ("Görev ata", kind = 'assigned'): OPEN → DONE;
--       - TAMAMLANAN kural görevleri (yalnız DONE): task_key = `${kind}:${özne id}:${vade}` — türetilen
--         görevin deterministik anahtarı; anahtar başına tek satır (crm_tasks_task_key_key).
--   * Tamamlama TEK transaction: crm_complete_task (görev satırı + isteğe bağlı aday notu + adayın statüsü /
--     sonraki arama tarihi). Sunucu kural görevini tamamlamadan önce yeniden türetip doğrular; istemcinin
--     söylediğine güvenilmez.
--   * Geri al = crm_reopen_task (tamamlayan ya da ADMIN): kural görevinin DONE satırı silinir, elle atanan
--     görev OPEN'a döner. Yazılan not ve aday değişiklikleri GERİ ALINMAZ.
--
-- KURAL SETİ (Edoras: demo 1 yıl, lisans 1 yıl; 1 haftalık demo, paket ve kontenjan yok). DeepSport
-- id'leri anlamı kaldıkça korundu; varsayılan gün parantezde:
--   scheduled         adayın sonraki arama günü (parametresiz)
--   offer             Teklif verildi + N gün (3)
--   demoEnding        ← demoShort + demoLong: DEMO kurumun demo bitişine N gün kala (30)
--   annualRenewal     ücretli kurumun son lisans bitişine N gün kala (60)
--   expired           ← expiredActive: demo ya da lisans bitti, ücretliye geçmedi / yenilenmedi → bitiş + N gün (0)
--                       (Edoras'ta ucuz bir "hâlâ kullanıyor" sinyali yok; kullanım okunmaz)
--   balance           satış − tahsilat (bağlı kurumun crm_payments'ı) > 0 → son güncelleme / tahsilat + N gün (7)
--   lostRecontact     Satış olmadı + N gün (90)
--   undatedFollowUp   tarihsiz Aranacak / Takipte → son güncelleme + N gün (0)
--   surveyNoResponse (5), coldList (2) — ayarlanabilir ama Anketler / Soğuk listeler modülü taşınana kadar
--                       görev üretmez.
--   Kaldırılanlar: quotaHigh (Edoras'ta kontenjan yok), demoShort / demoLong (demoEnding'de birleşti).
--
-- KURALLAR (veritabanında da zorunlu; sunucu service_role ile bağlanır, RLS'i görmez):
--   * kind / status / outcome / assignment_type tanımlı değerlerden.
--   * Özne: kurum kuralları (demoEnding, annualRenewal, expired) kuruma bağlıdır (institution_id; aday sonradan
--     bağlansa da tamamlanma kaydı korunur); diğer bütün görevler adaya (lead_id) → crm_tasks_subject_check.
--   * Kural görevi yalnız DONE saklanır; anahtarı tür + özne + vadeyle birebir tutarlı → crm_tasks_key_check.
--   * Elle atanan görevde amaç zorunlu; kural görevinde amaç, atanan kişi ve atama notu olmaz.
--   * Elle atanan görevin vadesi geçmiş bir gün olamaz; atanan kişi aktif CRM personeli → crm_tasks_guard.
--   * DONE ⇔ completed_at dolu; sonuç ve sonuç notu yalnız DONE'da → crm_tasks_done_check.
--     completed_by da yalnız DONE'da olur ve crm_complete_task onu her zaman oturumdaki kişiyle yazar; CHECK
--     "DONE ise dolu" demez, çünkü FK `on delete set null`: Auth kullanıcısı silinince kayıt kalmalı (notlar
--     ve işlem kaydıyla aynı düzen), silme CHECK'e takılmamalı.
--   * Notlar ≤ 2000 karakter; boş metin null'a çevrilir.
--   * crm_rules: gün 0–365; "scheduled" parametresiz (0).
--
-- GÜVENLİK: RLS açık, POLİTİKA YOK → yalnız service_role. Fonksiyonlar PUBLIC'ten geri alındı.
-- Geri almak: dosyanın sonundaki "GERİ ALMA" bloğu.
--
-- UYGULANDI: 2026-09-29, CRM projesine Supabase MCP apply_migration ile (ad: crm_tasks); dış
-- begin/commit çıkarılarak gönderildi.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1) Takip kuralları — satır başına bir kural; varsayılanlar aşağıda yazılır.
-- -----------------------------------------------------------------------------

create table if not exists public.crm_rules (
  id text primary key,
  enabled boolean not null default true,
  days integer not null default 0,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint crm_rules_id_check check (id in (
    'scheduled', 'offer', 'demoEnding', 'annualRenewal', 'expired', 'balance',
    'lostRecontact', 'undatedFollowUp', 'surveyNoResponse', 'coldList'
  )),
  constraint crm_rules_days_check check (days between 0 and 365),
  constraint crm_rules_scheduled_check check (id <> 'scheduled' or days = 0)
);

comment on table public.crm_rules is
  'EdorasCRM takip kuralları (Görevlerim''i üretir). Yalnız service_role; PUT yalnız ADMIN (sunucu).';

insert into public.crm_rules (id, enabled, days) values
  ('scheduled', true, 0),
  ('offer', true, 3),
  ('demoEnding', true, 30),
  ('annualRenewal', true, 60),
  ('expired', true, 0),
  ('balance', true, 7),
  ('lostRecontact', true, 90),
  ('undatedFollowUp', true, 0),
  ('surveyNoResponse', true, 5),
  ('coldList', true, 2)
on conflict (id) do nothing;

drop trigger if exists crm_rules_touch on public.crm_rules;
create trigger crm_rules_touch
  before update on public.crm_rules
  for each row execute function public.crm_touch_updated_at();

-- -----------------------------------------------------------------------------
-- 2) Görevler — elle atananlar ve tamamlanan kural görevleri
-- -----------------------------------------------------------------------------

create table if not exists public.crm_tasks (
  id uuid primary key default gen_random_uuid(),
  -- Kural görevinde kural id'si (crm_rules.id), elle atananda 'assigned'.
  kind text not null,
  lead_id uuid references public.crm_leads(id) on delete cascade,
  -- Edoras (bmjkpxbrmwxuildwakly) public.institutions.id — başka veritabanı, FK yok. Yalnız kurum kurallarında.
  institution_id uuid,
  -- Vade: Türkiye takvim günü.
  due_date date not null,
  status text not null default 'OPEN',
  -- null = ekip havuzu (herkes görür).
  assignee_id uuid references auth.users(id) on delete set null,
  -- Elle atanan görevin amacı ("Görev ata" → Amaç).
  assignment_type text,
  -- Kural görevinin anahtarı: `${kind}:${lead_id ya da institution_id}:${due_date}`.
  task_key text,
  -- Atayanın notu (yalnız elle atanan).
  note text,
  outcome text,
  -- Tamamlarken yazılan sonuç notu (adaya da crm_notes olarak düşer; adayı olmayan kurumda yalnız burada).
  result_note text,
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint crm_tasks_kind_check check (kind in (
    'assigned', 'scheduled', 'offer', 'demoEnding', 'annualRenewal', 'expired', 'balance',
    'lostRecontact', 'undatedFollowUp', 'surveyNoResponse', 'coldList'
  )),
  constraint crm_tasks_status_check check (status in ('OPEN', 'DONE')),
  constraint crm_tasks_outcome_check check (
    outcome is null or outcome in ('ulasildi', 'ulasilamadi', 'tekrar', 'ilgilenmiyor')
  ),
  constraint crm_tasks_assignment_type_check check (
    assignment_type is null
    or assignment_type in ('arama', 'anket', 'yenileme', 'tahsilat', 'demo', 'teklif', 'diger')
  ),
  -- Özne: kurum kuralları yalnız kuruma, diğerleri yalnız adaya bağlı (en az bir özne her zaman var).
  constraint crm_tasks_subject_check check (
    case
      when kind in ('demoEnding', 'annualRenewal', 'expired') then institution_id is not null and lead_id is null
      else lead_id is not null and institution_id is null
    end
  ),
  -- Kural görevi yalnız tamamlanınca saklanır (açık olanlar türetilir).
  constraint crm_tasks_rule_done_check check (kind = 'assigned' or status = 'DONE'),
  -- Anahtar yalnız kural görevinde ve tür + özne + vadeyle birebir tutarlı.
  constraint crm_tasks_key_check check (
    coalesce(
      case
        when kind = 'assigned' then task_key is null
        else task_key = kind || ':' || coalesce(lead_id, institution_id)::text || ':' || to_char(due_date, 'YYYY-MM-DD')
      end,
      false
    )
  ),
  -- Amaç yalnız (ve zorunlu olarak) elle atananda; kural görevinde atanan kişi ve atama notu yok.
  constraint crm_tasks_assigned_fields_check check (
    case
      when kind = 'assigned' then assignment_type is not null
      else assignment_type is null and assignee_id is null and note is null
    end
  ),
  -- DONE ⇔ tamamlanma anı; sonuç, sonuç notu ve tamamlayan yalnız DONE'da.
  constraint crm_tasks_done_check check (
    (status = 'DONE') = (completed_at is not null)
    and (status = 'DONE' or (outcome is null and result_note is null and completed_by is null))
  ),
  constraint crm_tasks_note_check check (
    (note is null or length(note) between 1 and 2000)
    and (result_note is null or length(result_note) between 1 and 2000)
  )
);

comment on table public.crm_tasks is
  'EdorasCRM görevleri: elle atananlar (OPEN/DONE) ve tamamlanan kural görevleri (DONE). Açık kural görevleri '
  'saklanmaz, istekte türetilir. Yalnız service_role.';

create unique index if not exists crm_tasks_task_key_key
  on public.crm_tasks (task_key) where task_key is not null;
create index if not exists crm_tasks_status_due_idx on public.crm_tasks (status, due_date);
create index if not exists crm_tasks_lead_idx on public.crm_tasks (lead_id) where lead_id is not null;

-- Aktif ADMIN mi (görev yetkisi: başkasının görevini tamamlama / geri alma).
create or replace function public.crm_is_admin(p_user uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.crm_staff s where s.user_id = p_user and s.role = 'ADMIN' and s.is_active
  );
$$;

-- Boş not → null; elle atanan görev geçmiş bir güne atanamaz; atanan kişi aktif CRM personeli olmalı.
-- CHECK'ler bu düzeltmeden SONRA değerlendirilir.
create or replace function public.crm_tasks_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.note := nullif(btrim(new.note), '');
  new.result_note := nullif(btrim(new.result_note), '');

  if tg_op = 'INSERT' and new.kind = 'assigned' and new.due_date < public.crm_today() then
    raise exception 'CRM_TASK_PAST_DUE' using hint = 'Görev bugün ya da sonrasına atanabilir.';
  end if;

  if new.assignee_id is not null
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id)
     and not exists (
       select 1 from public.crm_staff s where s.user_id = new.assignee_id and s.is_active
     ) then
    raise exception 'CRM_TASK_ASSIGNEE_INVALID' using hint = 'Görev yalnız aktif CRM personeline atanır.';
  end if;

  return new;
end;
$$;

drop trigger if exists crm_tasks_guard on public.crm_tasks;
create trigger crm_tasks_guard
  before insert or update on public.crm_tasks
  for each row execute function public.crm_tasks_guard();

-- -----------------------------------------------------------------------------
-- 3) Tamamlama ve geri alma — her biri tek transaction. Çağıran: EdorasCRM sunucusu (service_role).
-- -----------------------------------------------------------------------------

-- Görevi tamamlar:
--   * p_task_id verilirse elle atanan (saklı) görev DONE olur — atanmışsa yalnız atanan kişi ya da ADMIN;
--   * verilmezse kural görevi: p_task_key ile DONE satırı eklenir (sunucu görevi önce yeniden türetip doğrular).
--     Aynı anahtar ikinci kez tamamlanamaz → CRM_TASK_ALREADY_DONE.
--   * p_note doluysa adayın notlarına da yazılır (adayı olmayan kurum görevinde yalnız görev satırında kalır).
--   * p_lead_patch doluysa adayın statü kolonları güncellenir (sunucu lib/domain/crm/offer.ts →
--     applyStatusChange ile hesaplar; crm_leads CHECK'leri burada da geçerlidir). İzinli anahtarlar:
--     status, next_follow_up_at, lost_reason, offer_sent_at, sold_at.
-- Herhangi bir adım hata verirse hiçbiri yazılmaz.
create or replace function public.crm_complete_task(
  p_task_id uuid,
  p_task_key text,
  p_kind text,
  p_lead_id uuid,
  p_institution_id uuid,
  p_due_date date,
  p_outcome text,
  p_note text,
  p_lead_patch jsonb,
  p_actor uuid,
  p_actor_name text
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_task public.crm_tasks%rowtype;
  v_id uuid;
  v_lead uuid;
  v_note text := nullif(btrim(p_note), '');
  v_institution_kind boolean;
begin
  if p_actor is null then
    raise exception 'CRM_TASK_ACTOR_REQUIRED';
  end if;

  if p_task_id is not null then
    select * into v_task from public.crm_tasks t where t.id = p_task_id for update;
    if not found then
      raise exception 'CRM_TASK_NOT_FOUND';
    end if;
    if v_task.status = 'DONE' then
      raise exception 'CRM_TASK_ALREADY_DONE';
    end if;
    if v_task.assignee_id is not null and v_task.assignee_id <> p_actor and not public.crm_is_admin(p_actor) then
      raise exception 'CRM_TASK_NOT_ASSIGNEE' using hint = 'Atanmış görevi yalnız atanan kişi ya da yönetici tamamlar.';
    end if;
    update public.crm_tasks
       set status = 'DONE', outcome = p_outcome, result_note = v_note, completed_at = now(), completed_by = p_actor
     where id = p_task_id;
    v_id := p_task_id;
    v_lead := v_task.lead_id;
  else
    if p_task_key is null or p_kind is null or p_kind = 'assigned' then
      raise exception 'CRM_TASK_INVALID';
    end if;
    if exists (select 1 from public.crm_tasks t where t.task_key = p_task_key) then
      raise exception 'CRM_TASK_ALREADY_DONE';
    end if;
    v_institution_kind := p_kind in ('demoEnding', 'annualRenewal', 'expired');
    begin
      insert into public.crm_tasks (
        kind, lead_id, institution_id, due_date, status, task_key, outcome, result_note,
        completed_at, completed_by, created_by
      )
      values (
        p_kind,
        case when v_institution_kind then null else p_lead_id end,
        case when v_institution_kind then p_institution_id else null end,
        p_due_date, 'DONE', p_task_key, p_outcome, v_note, now(), p_actor, p_actor
      )
      returning id into v_id;
    exception when unique_violation then
      -- Aynı anda iki tamamlama: ikincisi kaybeder.
      raise exception 'CRM_TASK_ALREADY_DONE';
    end;
    -- Kurum görevinde not ve güncelleme kurumun bağlı adayına gider (varsa).
    v_lead := p_lead_id;
  end if;

  if v_lead is not null and v_note is not null then
    insert into public.crm_notes (lead_id, author_id, author_name, content)
    values (v_lead, p_actor, p_actor_name, v_note);
  end if;

  if v_lead is not null and p_lead_patch is not null and p_lead_patch <> '{}'::jsonb then
    if jsonb_typeof(p_lead_patch) <> 'object' or exists (
      select 1 from jsonb_object_keys(p_lead_patch) k
       where k not in ('status', 'next_follow_up_at', 'lost_reason', 'offer_sent_at', 'sold_at')
    ) then
      raise exception 'CRM_TASK_INVALID';
    end if;
    update public.crm_leads l
       set status = case when p_lead_patch ? 'status' then p_lead_patch->>'status' else l.status end,
           next_follow_up_at = case when p_lead_patch ? 'next_follow_up_at'
                                    then (p_lead_patch->>'next_follow_up_at')::date else l.next_follow_up_at end,
           lost_reason = case when p_lead_patch ? 'lost_reason' then p_lead_patch->>'lost_reason' else l.lost_reason end,
           offer_sent_at = case when p_lead_patch ? 'offer_sent_at'
                                then (p_lead_patch->>'offer_sent_at')::date else l.offer_sent_at end,
           sold_at = case when p_lead_patch ? 'sold_at' then (p_lead_patch->>'sold_at')::date else l.sold_at end,
           updated_by = p_actor
     where l.id = v_lead;
    if not found then
      raise exception 'CRM_TASK_LEAD_NOT_FOUND';
    end if;
  end if;

  return v_id;
end;
$$;

-- Geri al (yalnız tamamlayan ya da ADMIN): kural görevinin DONE satırı silinir (görev yeniden türetilir),
-- elle atanan görev OPEN'a döner. Tamamlarken yazılan not ve aday değişiklikleri geri alınmaz.
create or replace function public.crm_reopen_task(p_task_id uuid, p_actor uuid)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_task public.crm_tasks%rowtype;
begin
  select * into v_task from public.crm_tasks t where t.id = p_task_id for update;
  if not found then
    raise exception 'CRM_TASK_NOT_FOUND';
  end if;
  if v_task.status <> 'DONE' then
    raise exception 'CRM_TASK_NOT_DONE';
  end if;
  if v_task.completed_by is distinct from p_actor and not public.crm_is_admin(p_actor) then
    raise exception 'CRM_TASK_NOT_COMPLETER' using hint = 'Görevi yalnız tamamlayan kişi ya da yönetici geri alır.';
  end if;

  if v_task.kind = 'assigned' then
    update public.crm_tasks
       set status = 'OPEN', outcome = null, result_note = null, completed_at = null, completed_by = null
     where id = p_task_id;
  else
    delete from public.crm_tasks where id = p_task_id;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4) Yetkiler — yalnız service_role
-- -----------------------------------------------------------------------------

alter table public.crm_rules enable row level security;
alter table public.crm_tasks enable row level security;

revoke all on table public.crm_rules, public.crm_tasks from public, anon, authenticated;
grant select, insert, update, delete on table public.crm_rules, public.crm_tasks to service_role;

revoke execute on function
  public.crm_is_admin(uuid),
  public.crm_tasks_guard(),
  public.crm_complete_task(uuid, text, text, uuid, uuid, date, text, text, jsonb, uuid, text),
  public.crm_reopen_task(uuid, uuid)
  from public, anon, authenticated;

-- crm_is_admin tamamlama / geri alma fonksiyonlarının içinden service_role olarak çağrılır.
grant execute on function
  public.crm_is_admin(uuid),
  public.crm_complete_task(uuid, text, text, uuid, uuid, date, text, text, jsonb, uuid, text),
  public.crm_reopen_task(uuid, uuid)
  to service_role;

commit;

-- =============================================================================
-- GERİ ALMA (görevler ve kurallar silinir; tamamlarken yazılan aday notları ve aday değişiklikleri kalır):
--   begin;
--   drop function if exists public.crm_reopen_task(uuid, uuid);
--   drop function if exists public.crm_complete_task(uuid, text, text, uuid, uuid, date, text, text, jsonb, uuid, text);
--   drop table if exists public.crm_tasks, public.crm_rules;
--   drop function if exists public.crm_tasks_guard(), public.crm_is_admin(uuid);
--   commit;
-- =============================================================================
