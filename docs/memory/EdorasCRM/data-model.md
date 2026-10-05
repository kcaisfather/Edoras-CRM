# Veri modeli

Kurallar üç katmanda: zod (form) → `/api` (sunucu) → **veritabanı** (CHECK + tetikleyici). Sunucu `service_role`
kullandığı için RLS korumaz; kural mutlaka DB'de de durur. Tam kural tablosu: `README.md` → "Kurallar".

## CRM projesi migration'ları (hepsi uygulandı, 2026-10-01)

| Dosya | İçerik |
| --- | --- |
| `20260929120000_crm_core` | `crm_institutions` (DEMO / UCRETLI, iletişim, adres, TC/VKN), `crm_licenses` (1 yıl), `crm_payments`, `crm_enroll_institution`, `crm_convert_to_paid`, `crm_guard_payment`, `crm_is_valid_tckn/vkn` |
| `20260929150000_crm_staff_audit` | `crm_staff` (ADMIN / CRM_AGENT, aktiflik), `crm_audit_logs` (yalnız eklenir), `crm_internal_institutions` |
| `20260929160000_crm_leads` | `crm_leads`, `crm_notes` |
| `20260929170000_crm_tasks` | `crm_tasks`, `crm_rules`, `crm_complete_task`, `crm_reopen_task` |
| `20260929180000_crm_prospects` | `crm_prospect_lists`, `crm_prospects`, `crm_add_prospects`, `crm_convert_prospect` |
| `20260929190000_crm_surveys` | `crm_surveys`, `crm_survey_invitations`, `crm_survey_responses`, `crm_create_survey_invitation`, `crm_survey_open`, `crm_survey_submit` |
| `20260929200000_crm_invoices` | fatura profili sütunları (`crm_institutions`), `crm_invoices`, `crm_guard_invoice` |
| `20260929220000_crm_costs` | `crm_cost_entries`, `crm_cost_budgets`, `crm_cost_settings` |
| `20260929230000_crm_reports` | `crm_report_subscriptions`, `crm_report_runs` |
| `20261001090000_crm_invoice_provider_refs` | `crm_invoices.provider_ref` (Paraşüt satış faturası id, bir kez yazılır) + `provider_job` (süren iş) |
| `20261005100000_crm_loss_actor` | `crm_leads`: kayıp nedeni 12'li küme (eski 6 değer dönüştürüldü), `lost_note` / `competitor` / `recall_at` (yalnız OLUMSUZ), `offer_by` / `sold_by` (+ `crm_leads_actor` tetikleyicisi); `crm_complete_task` yeni anahtarları kabul eder |
| `20261005170000_crm_lead_sale_rules` | **CANLIYA UYGULANMADI (2026-10-05, kullanıcı onayı bekliyor).** `crm_leads_sale_rules` tetikleyicisi: Teklif verildi'ye geçişte / bu statüde tutar değişirken `offer_amount > 0`, Satış oldu'da `sale_amount > 0`, satışa geçişte aday UCRETLI + `billing_type` dolu kuruma bağlı; RPC `crm_record_lead_sale` (fatura profili + DEMO ise ücretliye geçiş ve satış tutarıyla 1 yıllık lisans + aday SATIS_OLDU, tek transaction) |

Hepsinde: RLS açık + politika yok (bilinçli; Supabase danışmanı "RLS Enabled No Policy" INFO verir, sorun değil),
yalnız `service_role`'e grant, fonksiyonlar PUBLIC'ten revoke. Her dosyanın sonunda geri alma bloğu var.

## Edoras'ta dokunulan tablolar (şema YKS'de)

| Tablo | Nasıl |
| --- | --- |
| `institutions` | liste / ad çakışması okuma; demo: `insert (name, program 'yks'\|'lgs', is_active)` |
| `academic_years`, `academic_terms` | demo: aktif yıl + dönem (`initialAcademicPeriod`, `lib/domain/institutions/rules.ts`) |
| `auth.users` (admin API), `profiles`, `institution_users` (`role 'admin'`) | demo: kurum yöneticisi |
| RPC `auth_user_email_taken` | e-posta çakışması (YKS migration 019) |
| RPC `delete_institution_guarded(id, ad)` | yalnız demo geri alma (YKS migration 192; 266 geri alma yolunu düzeltti) |
| `students`, `attendance_sessions`, `lesson_topic_logs`, `assignments`, `exams`, `announcements`, `sms_logs`… | salt okunur kullanım sinyali → [modules/growth-analytics.md](modules/growth-analytics.md) |

Edoras'ta düz `DELETE institutions` tetikleyiciyle engellidir (YKS 192). Kurum asla pasife çekilmez (demo bitse de).
