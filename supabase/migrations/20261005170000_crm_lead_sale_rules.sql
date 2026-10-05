-- =============================================================================
-- EdorasCRM · 20261005170000 — teklif ve satış kuralları + satışla hesap açma
--
-- NEREYE: EdorasCRM'in kendi Supabase projesi (orishbqniebbgdanazrp). Edoras'a dokunmaz.
-- NEDEN (kurucu, 2026-10-05): "Teklif verildiyse fiyat girilmek zorunda; satış yapıldıysa fiyat ve firma bilgileri
--        girilmek zorunda; satış yapıldıysa direkt hesabı açmalı."
--
--   1) crm_leads_sale_rules (tetikleyici):
--      * "Teklif verildi"ye GEÇİŞTE ya da bu statüde tutar değişirken teklif tutarı > 0 olmalı → CRM_OFFER_AMOUNT_REQUIRED
--      * "Satış oldu"ya GEÇİŞTE ya da bu statüde tutar değişirken satış tutarı > 0 olmalı → CRM_SALE_AMOUNT_REQUIRED
--      * "Satış oldu"ya GEÇİŞTE aday ücretli (UCRETLI) ve fatura profili tam (billing_type dolu ⇒ unvan, il, ilçe,
--        fatura e-postası, adres, TC/VKN — crm_institutions_billing_profile_check) bir kuruma bağlı olmalı
--        → CRM_SALE_ACCOUNT_REQUIRED. Yani satış ancak hesap açıkken kaydedilir; panel bunu crm_record_lead_sale ile
--        tek adımda yapar. Geçiş dışındaki güncellemeler (kurum bağlantısını düzeltmek, not…) engellenmez.
--   2) crm_record_lead_sale (RPC, tek transaction): fatura profili yazılır; kurum DEMO ise ücretliye geçer ve satış
--      tutarıyla bugünden 1 yıllık lisans açılır (UCRETLI ise lisansa dokunulmaz); aday kuruma bağlanır ve
--      "Satış oldu"ya geçer (satış tutarı, satış tarihi; takip / kayıp alanları temizlenir; sold_by aktör
--      tetikleyicisinden updated_by ile). Edoras'ta YENİ kurum açılacaksa sunucu önce kurumu açıp DEMO olarak kayda alır
--      (lib/server/institutions.ts createDemoInstitution, geri alma zinciriyle), sonra bu fonksiyonu çağırır.
--
-- MEVCUT SATIRLAR: kurallar yalnız geçişte / tutar değişiminde çalışır; canlıda (2026-10-05) 1 aday var, ARANACAK.
-- GÜVENLİK: fonksiyonlar PUBLIC / anon / authenticated'dan geri alındı (yalnız service_role).
-- Geri almak: dosyanın sonundaki "GERİ ALMA" bloğu.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1) Teklif / satış kuralları
-- -----------------------------------------------------------------------------

create or replace function public.crm_leads_sale_rules()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_entering boolean;
begin
  if new.status = 'TEKLIF_VERILDI'
     and (tg_op = 'INSERT' or old.status is distinct from new.status or old.offer_amount is distinct from new.offer_amount)
     and coalesce(new.offer_amount, 0) <= 0 then
    raise exception 'CRM_OFFER_AMOUNT_REQUIRED' using hint = 'Teklif verildi: teklif tutarı zorunlu.';
  end if;

  if new.status = 'SATIS_OLDU' then
    v_entering := tg_op = 'INSERT' or old.status is distinct from 'SATIS_OLDU';
    if (v_entering or old.sale_amount is distinct from new.sale_amount) and coalesce(new.sale_amount, 0) <= 0 then
      raise exception 'CRM_SALE_AMOUNT_REQUIRED' using hint = 'Satış oldu: satış tutarı zorunlu.';
    end if;
    if v_entering and (
      new.institution_id is null
      or not exists (
        select 1 from public.crm_institutions c
         where c.institution_id = new.institution_id
           and c.status = 'UCRETLI'
           and c.billing_type is not null
      )
    ) then
      raise exception 'CRM_SALE_ACCOUNT_REQUIRED' using hint = 'Satış: ücretli hesap ve tam fatura bilgisi gerekir.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists crm_leads_sale_rules on public.crm_leads;
create trigger crm_leads_sale_rules
  before insert or update on public.crm_leads
  for each row execute function public.crm_leads_sale_rules();

-- -----------------------------------------------------------------------------
-- 2) Satışı kaydet: fatura profili + (DEMO ise) ücretliye geçiş ve lisans + aday "Satış oldu"
-- -----------------------------------------------------------------------------

create or replace function public.crm_record_lead_sale(
  p_lead_id uuid,
  p_institution_id uuid,
  p_sale_amount numeric,
  p_address text,
  p_tc_no text,
  p_tax_no text,
  p_billing_type text,
  p_legal_name text,
  p_tax_office text,
  p_city text,
  p_district text,
  p_postal_code text,
  p_email text,
  p_organization_name text,
  p_actor uuid
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_lead_institution uuid;
  v_status text;
  v_license_id uuid;
begin
  if p_actor is null or p_institution_id is null then
    raise exception 'CRM_SALE_INVALID';
  end if;
  if p_sale_amount is null or p_sale_amount <= 0 then
    raise exception 'CRM_SALE_AMOUNT_REQUIRED';
  end if;

  select l.institution_id into v_lead_institution from public.crm_leads l where l.id = p_lead_id for update;
  if not found then
    raise exception 'CRM_LEAD_NOT_FOUND';
  end if;
  if v_lead_institution is not null and v_lead_institution <> p_institution_id then
    raise exception 'CRM_LEAD_ALREADY_LINKED';
  end if;

  select c.status into v_status from public.crm_institutions c where c.institution_id = p_institution_id for update;
  if v_status is null then
    raise exception 'CRM_NOT_ENROLLED';
  end if;

  -- Fatura profili (kısıtlar: crm_institutions_billing_profile_check, *_paid_billing_check, TC/VKN kontrol hanesi).
  update public.crm_institutions
     set address = nullif(btrim(p_address), ''),
         tc_no = nullif(p_tc_no, ''),
         tax_no = nullif(p_tax_no, ''),
         billing_type = p_billing_type,
         legal_name = p_legal_name,
         tax_office = nullif(btrim(p_tax_office), ''),
         billing_city = p_city,
         billing_district = p_district,
         postal_code = nullif(btrim(p_postal_code), ''),
         billing_email = p_email,
         status = 'UCRETLI',
         converted_at = case when v_status = 'DEMO' then now() else converted_at end
   where institution_id = p_institution_id;

  if v_status = 'DEMO' then
    insert into public.crm_licenses (institution_id, starts_on, ends_on, price, created_by)
    values (p_institution_id, public.crm_today(), (public.crm_today() + interval '1 year')::date, p_sale_amount, p_actor)
    returning id into v_license_id;
  end if;

  -- UPDATE içindeki sütun adları ESKİ değerdir (sold_at korunur ya da bugün olur).
  update public.crm_leads
     set institution_id = p_institution_id,
         organization_name = coalesce(organization_name, nullif(btrim(p_organization_name), '')),
         status = 'SATIS_OLDU',
         sale_amount = round(p_sale_amount, 2),
         sold_at = case when status = 'SATIS_OLDU' then coalesce(sold_at, public.crm_today()) else public.crm_today() end,
         next_follow_up_at = null,
         lost_reason = null,
         lost_note = null,
         competitor = null,
         recall_at = null,
         updated_by = p_actor
   where id = p_lead_id;

  return jsonb_build_object('licenseId', v_license_id, 'converted', v_status = 'DEMO');
end;
$$;

revoke execute on function public.crm_leads_sale_rules() from public, anon, authenticated;
revoke execute on function public.crm_record_lead_sale(uuid, uuid, numeric, text, text, text, text, text, text, text, text, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.crm_record_lead_sale(uuid, uuid, numeric, text, text, text, text, text, text, text, text, text, text, text, uuid)
  to service_role;

commit;

-- =============================================================================
-- GERİ ALMA:
--   begin;
--   drop trigger if exists crm_leads_sale_rules on public.crm_leads;
--   drop function if exists public.crm_leads_sale_rules();
--   drop function if exists public.crm_record_lead_sale(uuid, uuid, numeric, text, text, text, text, text, text, text, text, text, text, text, uuid);
--   commit;
-- =============================================================================
