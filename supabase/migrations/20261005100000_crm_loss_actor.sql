-- =============================================================================
-- EdorasCRM · 20261005100000 — kayıp nedeni 12'li küme + kayıp ayrıntısı, teklifi veren / satışı yapan
--
-- NEREYE: EdorasCRM'in kendi Supabase projesi (orishbqniebbgdanazrp). Edoras'a dokunmaz.
-- NEDEN: DeepSportAdmin (Ekim 2026, G53 ortak kayıp nedeni kümesi + kayıp ayrıntısı; CRM_ACTOR_FIELDS).
--
-- 1) Kayıp nedeni: eski 6 değer (FIYAT, BUTCE, RAKIP, IHTIYAC_YOK, ZAMANLAMA, DIGER) 12'li ortak kümeye
--    dönüştürülür (DeepSport LEGACY_TO_CURRENT ile aynı eşleme) ve crm_leads_lost_reason_check yenilenir:
--      PRICE, BUDGET_NOT_APPROVED, NOT_USED, SEASON_ENDED, TEAM_DISBANDED, COACH_LEFT_CLUB, COMPETITOR,
--      MISSING_FEATURE_TECH, DISSATISFIED, NOT_DECISION_MAKER, UNREACHABLE, OTHER
--    Eski değerler artık KABUL EDİLMEZ (veri dönüştürüldü).
-- 2) Kayıp ayrıntısı (yeni kolonlar): lost_note (kayıp notu), competitor (rakip adı; yalnız neden COMPETITOR),
--    recall_at (yeniden temas günü). Üçü de yalnız statü OLUMSUZ ("Satış olmadı") iken dolu olabilir →
--    "Satış olmadı"dan çıkınca temizlenmeleri gerekir (sunucu temizler; görev tamamlama crm_complete_task ile).
-- 3) Aktör alanları: offer_by (teklifi veren), sold_by (satışı yapan) — auth.users FK, null olabilir.
--    Sunucu statü TEKLIF_VERILDI / SATIS_OLDU'ya geçişte oturumdaki personeli yazar; gövdeden okunmaz.
--    crm_leads_actor tetikleyicisi güvence verir: geçişte alan elle değiştirilmediyse updated_by'dan (insert'te
--    created_by'dan) doldurur (görev tamamlama gibi doğrudan SQL yolları da dolu bırakır); SATIS_OLDU'dan çıkınca
--    sold_by temizlenir (sold_at ile aynı kural). offer_by, satışa geçse de korunur.
--
-- GÜVENLİK: RLS/grant değişmez (yalnız service_role). Yeni tetikleyici fonksiyonu PUBLIC'ten geri alındı.
-- Geri almak: dosyanın sonundaki "GERİ ALMA" bloğu.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1) Kayıp nedeni: eski kısıtı kaldır, değerleri dönüştür, yeni kısıt
-- -----------------------------------------------------------------------------

alter table public.crm_leads drop constraint if exists crm_leads_lost_reason_check;

update public.crm_leads
   set lost_reason = case lost_reason
     when 'FIYAT' then 'PRICE'
     when 'BUTCE' then 'BUDGET_NOT_APPROVED'
     when 'RAKIP' then 'COMPETITOR'
     when 'IHTIYAC_YOK' then 'NOT_USED'
     when 'ZAMANLAMA' then 'SEASON_ENDED'
     when 'DIGER' then 'OTHER'
     else lost_reason
   end
 where lost_reason in ('FIYAT', 'BUTCE', 'RAKIP', 'IHTIYAC_YOK', 'ZAMANLAMA', 'DIGER');

alter table public.crm_leads
  add constraint crm_leads_lost_reason_check check (
    lost_reason is null
    or (
      status = 'OLUMSUZ'
      and lost_reason in (
        'PRICE', 'BUDGET_NOT_APPROVED', 'NOT_USED', 'SEASON_ENDED', 'TEAM_DISBANDED', 'COACH_LEFT_CLUB',
        'COMPETITOR', 'MISSING_FEATURE_TECH', 'DISSATISFIED', 'NOT_DECISION_MAKER', 'UNREACHABLE', 'OTHER'
      )
    )
  );

-- -----------------------------------------------------------------------------
-- 2) Kayıp ayrıntısı ve aktör kolonları
-- -----------------------------------------------------------------------------

alter table public.crm_leads
  add column if not exists lost_note text,
  add column if not exists competitor text,
  add column if not exists recall_at date,
  add column if not exists offer_by uuid references auth.users(id) on delete set null,
  add column if not exists sold_by uuid references auth.users(id) on delete set null;

comment on column public.crm_leads.lost_note is 'Kayıp notu (yalnız OLUMSUZ). En çok 2000 karakter.';
comment on column public.crm_leads.competitor is 'Tercih edilen rakip (yalnız OLUMSUZ + neden COMPETITOR). En çok 128 karakter.';
comment on column public.crm_leads.recall_at is 'Yeniden temas günü (yalnız OLUMSUZ).';
comment on column public.crm_leads.offer_by is 'Teklifi veren personel (TEKLIF_VERILDI geçişinde oturumdan yazılır).';
comment on column public.crm_leads.sold_by is 'Satışı yapan personel (SATIS_OLDU geçişinde oturumdan yazılır; satıştan çıkınca silinir).';

alter table public.crm_leads
  add constraint crm_leads_loss_detail_check check (
    (lost_note is null and competitor is null and recall_at is null)
    or status = 'OLUMSUZ'
  ),
  add constraint crm_leads_competitor_check check (competitor is null or lost_reason = 'COMPETITOR'),
  add constraint crm_leads_loss_length_check check (
    coalesce(length(lost_note), 0) <= 2000 and coalesce(length(competitor), 0) <= 128
  ),
  add constraint crm_leads_sold_by_check check (sold_by is null or status = 'SATIS_OLDU');

-- -----------------------------------------------------------------------------
-- 3) Normalleştirme: yeni metin kolonları da boş → null
-- -----------------------------------------------------------------------------

create or replace function public.crm_leads_normalize()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  new.organization_name := nullif(btrim(regexp_replace(new.organization_name, '\s+', ' ', 'g')), '');
  new.contact_first_name := nullif(btrim(regexp_replace(new.contact_first_name, '\s+', ' ', 'g')), '');
  new.contact_last_name := nullif(btrim(regexp_replace(new.contact_last_name, '\s+', ' ', 'g')), '');
  new.contact_email := lower(nullif(btrim(new.contact_email), ''));
  new.contact_phone := nullif(btrim(new.contact_phone), '');
  new.city := nullif(btrim(new.city), '');
  new.district := nullif(btrim(new.district), '');
  new.country := nullif(btrim(new.country), '');
  new.lost_note := nullif(btrim(new.lost_note), '');
  new.competitor := nullif(btrim(regexp_replace(new.competitor, '\s+', ' ', 'g')), '');
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4) Aktör tetikleyicisi (ad sırasıyla normalize'dan önce çalışır; CHECK'ler satır yazılırken değerlendirilir)
-- -----------------------------------------------------------------------------

create or replace function public.crm_leads_actor()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'TEKLIF_VERILDI' and new.offer_by is null then
      new.offer_by := coalesce(new.updated_by, new.created_by);
    end if;
    if new.status = 'SATIS_OLDU' and new.sold_by is null then
      new.sold_by := coalesce(new.updated_by, new.created_by);
    end if;
  else
    -- Geçişte alan elle değiştirilmediyse işlemi yapan (updated_by) yazılır.
    if new.status = 'TEKLIF_VERILDI' and old.status is distinct from 'TEKLIF_VERILDI'
       and new.offer_by is not distinct from old.offer_by then
      new.offer_by := coalesce(new.updated_by, new.offer_by);
    end if;
    if new.status = 'SATIS_OLDU' and old.status is distinct from 'SATIS_OLDU'
       and new.sold_by is not distinct from old.sold_by then
      new.sold_by := coalesce(new.updated_by, new.sold_by);
    end if;
  end if;
  if new.status <> 'SATIS_OLDU' then
    new.sold_by := null;
  end if;
  return new;
end;
$$;

drop trigger if exists crm_leads_actor on public.crm_leads;
create trigger crm_leads_actor
  before insert or update on public.crm_leads
  for each row execute function public.crm_leads_actor();

revoke execute on function public.crm_leads_actor() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5) Görev tamamlama: aday yaması artık kayıp ayrıntısı anahtarlarını da kabul eder
--    (OLUMSUZ'dan çıkarken lost_note / competitor / recall_at temizlenebilsin).
--    Gövde 20260929170000_crm_tasks'tan; tek fark: izinli anahtarlar ve üç yeni kolon.
-- -----------------------------------------------------------------------------

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
       where k not in ('status', 'next_follow_up_at', 'lost_reason', 'offer_sent_at', 'sold_at',
                       'lost_note', 'competitor', 'recall_at')
    ) then
      raise exception 'CRM_TASK_INVALID';
    end if;
    -- offer_by / sold_by yamada gelmez: crm_leads_actor tetikleyicisi updated_by'dan (= p_actor) yazar.
    update public.crm_leads l
       set status = case when p_lead_patch ? 'status' then p_lead_patch->>'status' else l.status end,
           next_follow_up_at = case when p_lead_patch ? 'next_follow_up_at'
                                    then (p_lead_patch->>'next_follow_up_at')::date else l.next_follow_up_at end,
           lost_reason = case when p_lead_patch ? 'lost_reason' then p_lead_patch->>'lost_reason' else l.lost_reason end,
           lost_note = case when p_lead_patch ? 'lost_note' then p_lead_patch->>'lost_note' else l.lost_note end,
           competitor = case when p_lead_patch ? 'competitor' then p_lead_patch->>'competitor' else l.competitor end,
           recall_at = case when p_lead_patch ? 'recall_at'
                            then (p_lead_patch->>'recall_at')::date else l.recall_at end,
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

commit;

-- =============================================================================
-- GERİ ALMA (yeni kolonlardaki veri silinir; kayıp nedenini önce eski kümeye eşleyin, yoksa eski kısıt reddeder).
-- crm_complete_task'ı 20260929170000_crm_tasks'taki tanımla, crm_leads_normalize'ı 20260929160000_crm_leads'teki
-- tanımla yeniden oluşturun:
--   begin;
--   drop trigger if exists crm_leads_actor on public.crm_leads;
--   drop function if exists public.crm_leads_actor();
--   alter table public.crm_leads
--     drop constraint if exists crm_leads_sold_by_check, drop constraint if exists crm_leads_loss_length_check,
--     drop constraint if exists crm_leads_competitor_check, drop constraint if exists crm_leads_loss_detail_check,
--     drop constraint if exists crm_leads_lost_reason_check;
--   update public.crm_leads set lost_reason = case lost_reason when 'PRICE' then 'FIYAT'
--     when 'BUDGET_NOT_APPROVED' then 'BUTCE' when 'COMPETITOR' then 'RAKIP' when 'NOT_USED' then 'IHTIYAC_YOK'
--     when 'SEASON_ENDED' then 'ZAMANLAMA' else 'DIGER' end where lost_reason is not null;
--   alter table public.crm_leads
--     drop column if exists lost_note, drop column if exists competitor, drop column if exists recall_at,
--     drop column if exists offer_by, drop column if exists sold_by,
--     add constraint crm_leads_lost_reason_check check (lost_reason is null
--       or (status = 'OLUMSUZ' and lost_reason in ('FIYAT','ZAMANLAMA','RAKIP','IHTIYAC_YOK','BUTCE','DIGER')));
--   commit;
-- =============================================================================
