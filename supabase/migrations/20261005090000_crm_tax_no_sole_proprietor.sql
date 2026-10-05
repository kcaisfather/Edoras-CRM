-- Şahıs şirketi: kurumsal faturada vergi numarası sahibin 11 haneli TC kimlik numarasıdır (DeepSport c933af9).
-- tax_no artık geçerli bir VKN (10 hane) ya da TCKN (11 hane) kabul eder. Diğer kurallar aynı kalır:
-- COMPANY ⇔ tax_no dolu + tc_no boş + vergi dairesi (crm_institutions_billing_profile_check), tc_no yalnız TCKN.
begin;

alter table public.crm_institutions drop constraint crm_institutions_tax_no_check;
alter table public.crm_institutions
  add constraint crm_institutions_tax_no_check
    check (tax_no is null or public.crm_is_valid_vkn(tax_no) or public.crm_is_valid_tckn(tax_no));

comment on column public.crm_institutions.tax_no is
  'Vergi numarası: VKN (10 hane) ya da şahıs şirketinin TCKN''si (11 hane). Vergi dairesi yalnız bu alanla.';

commit;
