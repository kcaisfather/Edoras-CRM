-- =============================================================================
-- EdorasCRM · 20261005140000 — aday birleştirme (crm_merge_leads)
--
-- NEREYE: EdorasCRM'in kendi Supabase projesi (orishbqniebbgdanazrp). Edoras'a dokunmaz.
-- NEDEN: Mükerrer iki adayı tek kayıtta toplamak. Tek işlemde (atomik) olur: yarım birleştirme kalmaz.
--
-- crm_merge_leads(p_keep, p_drop, p_actor): p_drop silinir, p_keep kalır.
--   * Taşınanlar: notlar, görevler, randevular, anket davetleri / yanıtları, soğuk liste kişileri.
--     Kural görevlerinin (task_key) anahtarı yeni adaya göre yeniden yazılır; p_keep'te aynı anahtar varsa
--     tekrar eden kayıt silinir (görev geçmişi bir kez sayılır).
--   * p_keep'in boş alanları p_drop'tan doldurulur (kurum adı, yetkili, e-posta, telefon, konum, teklif / satış
--     tutarı, sorumlu). Statü, tarihler, kayıp ayrıntısı ve dolu alanlar p_keep'te aynen kalır.
--   * Kurum bağlantısı: ikisi de farklı bir kuruma bağlıysa CRM_MERGE_BOTH_LINKED; yalnız p_drop bağlıysa
--     bağlantı p_keep'e geçer.
--   * Dönüş: taşınan satır sayıları (jsonb) — işlem kaydı için.
--
-- GÜVENLİK: yalnız service_role çağırır (PUBLIC / anon / authenticated'dan geri alındı). Yetki (yalnız ADMIN) sunucuda.
-- Geri almak: dosyanın sonundaki "GERİ ALMA" bloğu (birleştirilmiş adaylar geri gelmez).
-- =============================================================================

begin;

create or replace function public.crm_merge_leads(p_keep uuid, p_drop uuid, p_actor uuid)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_keep public.crm_leads%rowtype;
  v_drop public.crm_leads%rowtype;
  v_notes integer;
  v_tasks integer;
  v_tasks_dropped integer;
  v_appointments integer;
  v_invitations integer;
  v_responses integer;
  v_prospects integer;
begin
  if p_keep is null or p_drop is null or p_keep = p_drop then
    raise exception 'CRM_MERGE_INVALID';
  end if;
  if p_actor is null then
    raise exception 'CRM_MERGE_ACTOR_REQUIRED';
  end if;

  -- Kilit sırası sabit (id'ye göre): iki birleştirme birbirini kilitlemesin.
  perform 1 from public.crm_leads where id in (p_keep, p_drop) order by id for update;
  select * into v_keep from public.crm_leads where id = p_keep;
  select * into v_drop from public.crm_leads where id = p_drop;
  if v_keep.id is null or v_drop.id is null then
    raise exception 'CRM_MERGE_NOT_FOUND';
  end if;
  if v_keep.institution_id is not null and v_drop.institution_id is not null then
    raise exception 'CRM_MERGE_BOTH_LINKED' using hint = 'İki aday da farklı kurumlara bağlı; önce birinin bağlantısını kaldırın.';
  end if;

  -- Kurum bağlantısı tekil: önce silinecek adaydan boşalt.
  if v_drop.institution_id is not null then
    update public.crm_leads set institution_id = null where id = p_drop;
  end if;

  update public.crm_notes set lead_id = p_keep where lead_id = p_drop;
  get diagnostics v_notes = row_count;

  -- Elle atanmış görevler olduğu gibi taşınır.
  update public.crm_tasks set lead_id = p_keep where lead_id = p_drop and kind = 'assigned';
  get diagnostics v_tasks = row_count;
  -- Kural görevleri: anahtar adayı içerir → yeniden yaz; p_keep'te aynı anahtar varsa kopya silinir.
  delete from public.crm_tasks t
   where t.lead_id = p_drop and t.kind <> 'assigned'
     and exists (
       select 1 from public.crm_tasks k
        where k.task_key = t.kind || ':' || p_keep::text || ':' || to_char(t.due_date, 'YYYY-MM-DD')
     );
  get diagnostics v_tasks_dropped = row_count;
  update public.crm_tasks
     set lead_id = p_keep,
         task_key = kind || ':' || p_keep::text || ':' || to_char(due_date, 'YYYY-MM-DD')
   where lead_id = p_drop and kind <> 'assigned';

  update public.crm_appointments set lead_id = p_keep where lead_id = p_drop;
  get diagnostics v_appointments = row_count;
  update public.crm_survey_invitations set lead_id = p_keep where lead_id = p_drop;
  get diagnostics v_invitations = row_count;
  update public.crm_survey_responses set lead_id = p_keep where lead_id = p_drop;
  get diagnostics v_responses = row_count;
  update public.crm_prospects set crm_lead_id = p_keep where crm_lead_id = p_drop;
  get diagnostics v_prospects = row_count;

  delete from public.crm_leads where id = p_drop;

  update public.crm_leads
     set organization_name = coalesce(v_keep.organization_name, v_drop.organization_name),
         contact_first_name = coalesce(v_keep.contact_first_name, v_drop.contact_first_name),
         contact_last_name = coalesce(v_keep.contact_last_name, v_drop.contact_last_name),
         contact_email = coalesce(v_keep.contact_email, v_drop.contact_email),
         contact_phone = coalesce(v_keep.contact_phone, v_drop.contact_phone),
         city = coalesce(v_keep.city, v_drop.city),
         district = coalesce(v_keep.district, v_drop.district),
         country = coalesce(v_keep.country, v_drop.country),
         offer_amount = coalesce(v_keep.offer_amount, v_drop.offer_amount),
         sale_amount = coalesce(v_keep.sale_amount, v_drop.sale_amount),
         owner_id = coalesce(v_keep.owner_id, v_drop.owner_id),
         institution_id = coalesce(v_keep.institution_id, v_drop.institution_id),
         updated_by = p_actor
   where id = p_keep;

  return jsonb_build_object(
    'notes', v_notes,
    'tasks', v_tasks,
    'tasksDropped', v_tasks_dropped,
    'appointments', v_appointments,
    'invitations', v_invitations,
    'responses', v_responses,
    'prospects', v_prospects
  );
end;
$$;

revoke execute on function public.crm_merge_leads(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.crm_merge_leads(uuid, uuid, uuid) to service_role;

commit;

-- =============================================================================
-- GERİ ALMA:
--   begin;
--   drop function if exists public.crm_merge_leads(uuid, uuid, uuid);
--   commit;
-- =============================================================================
