# Veri modeli

Kurallar üç katmanda: zod (form) → `/api` (sunucu) → **veritabanı** (CHECK + tetikleyici). Sunucu `service_role`
kullandığı için RLS korumaz; kural mutlaka DB'de de durur. Tam kural tablosu: `README.md` → "Kurallar".

## CRM projesi migration'ları (hepsi canlıda — 2026-10-14 şemadan doğrulandı)

Bazıları panel SQL Editor ile elle uygulandığı için MCP `list_migrations` geçmişinde yok (`crm_license_pricing`,
`crm_demo_duration`); "uygulandı mı" sorusunu geçmiş listesiyle değil şemayla (tablo / sütun / kısıt / imza) yanıtla.

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
| `20261005170000_crm_lead_sale_rules` | `crm_leads_sale_rules` tetikleyicisi: Teklif verildi'ye geçişte / bu statüde tutar değişirken `offer_amount > 0`, Satış oldu'da `sale_amount > 0`, satışa geçişte aday UCRETLI + `billing_type` dolu kuruma bağlı; RPC `crm_record_lead_sale` (fatura profili + DEMO ise ücretliye geçiş ve satış tutarıyla 1 yıllık lisans + aday SATIS_OLDU, tek transaction) |
| `20261005190000_crm_license_pricing` (2026-10-05 panel SQL Editor ile elle uygulandı; MCP migration geçmişinde yok) | `crm_license_pricing` (tek liste fiyatı), `crm_licenses.list_price` / `discount_percent` (`crm_licenses_discount_check`: bedel = liste × (100 − %) / 100), faturalı lisans / ödeme düzeltilemez (`CRM_SALE_INVOICED`), bedel düzelince "Satış oldu" adayın `sale_amount`'ı (eski bedele eşitse) da düzelir |
| `20261012120000_crm_demo_duration` (panel SQL Editor ile elle uygulandı; MCP migration geçmişinde yok) | Demo süresi kurum bazlı (2026-10-12): `crm_institutions_demo_dates_check` = DEMO'da bitiş dolu ve > başlangıç (eski: tam 1 yıl; mevcut satırlar uyar); `crm_enroll_institution` 14 parametre (`p_demo_ends_on`, DEMO'da boşsa `CRM_DEMO_END_REQUIRED` — hazır süre yok), eski 13 parametreli imza DROP, revoke / grant yeniden. Bitişi sonradan değiştirmek ayrı fonksiyon değil: sunucu `updateDemoEnd` (ADMIN, `PATCH /api/institutions/{id}/demo`) |
| `20261014120000_crm_kca_links` (2026-10-14 MCP `apply_migration` ile uygulandı) | `crm_kca_links`: CRM personeli ↔ KCA Panel kullanıcısı (Turso `users.id`), personel başına tek, KCA hesabı başına tek (`crm_kca_links_kca_user_key`); `kca_password_fp` (KCA şifre özetinin SHA-256'sı, 64 onaltılık) — şifre değişince bağ düşer; personel silinince bağ da. Uygulanmadan Yönetim sayfaları 503 `CONFIG_MISSING` → [modules/management-kca.md](modules/management-kca.md) |

Hepsinde: RLS açık + politika yok (bilinçli; Supabase danışmanı "RLS Enabled No Policy" INFO verir, sorun değil),
yalnız `service_role`'e grant, fonksiyonlar PUBLIC'ten revoke. Her dosyanın sonunda geri alma bloğu var.

## Edoras'ta dokunulan tablolar (şema YKS'de)

| Tablo | Nasıl |
| --- | --- |
| `institutions` | liste / ad çakışması okuma; demo: `insert (name, program 'yks'\|'lgs', is_active)` |
| `academic_years`, `academic_terms` | demo: aktif yıl + dönem (`initialAcademicPeriod`, `lib/domain/institutions/rules.ts`) |
| `auth.users` (admin API), `profiles`, `institution_users` (`role 'admin'`) | demo: kurum yöneticisi |
| `auth.users` (`getUserById` / `updateUserById`), `profiles.email` / `is_active`, `institution_users.is_active` | kurum yöneticisi hesap işlemleri (yalnız ADMIN, 2026-10-12): giriş e-postası (Auth + `profiles.email` birlikte; Edoras'ta auth→profiles tetikleyicisi yok), şifre, bu kurumdaki üyeliğin aktifliği — yalnız `(kurum, kullanıcı, role 'admin')` üyeliği olan hesapta → [modules/institutions-demo.md](modules/institutions-demo.md) |
| `institution_users` (okuma) | Kurum yöneticileri kartı: aynı hesabın başka kurumlardaki üyelik sayısı; `profiles.is_super_admin` okunur (süper yöneticiye işlem yok) |
| `panel_modules` (okuma), `institution_panel_modules` (upsert) | panel modülleri (YKS migration 300) |
| `institution_feature_settings` (4 mesajlaşma anahtarı upsert), `institution_users.permission_overrides` (yalnız `messaging.parents`) + `permission_presets` / `profiles` (okuma) | mesajlaşma yetkileri — yalnız `messaging` modülü açıkken (2026-10-21) → [modules/institutions-demo.md](modules/institutions-demo.md) |
| RPC `auth_user_email_taken(p_email, p_exclude_user_id)` | e-posta çakışması (YKS migration 019); e-posta değişikliğinde hesabın kendisi hariç |
| RPC `delete_institution_guarded(id, ad)` | yalnız demo geri alma (YKS migration 192; 266 geri alma yolunu düzeltti) |
| `students`, `attendance_sessions`, `lesson_topic_logs`, `assignments`, `exams`, `announcements`, `sms_logs`… | salt okunur kullanım sinyali → [modules/growth-analytics.md](modules/growth-analytics.md) |

Edoras'ta düz `DELETE institutions` tetikleyiciyle engellidir (YKS 192). Kurum asla pasife çekilmez (demo bitse de).

## KCA Panel (Turso) — dokunulan tablolar (şema KCA Panel'de, `kcaisfather/KCAPanel` `lib/schema.js`)

Yalnız `lib/server/kca-store.ts`; yalnız Edoras kapsamı (kök "Edoras" ana projesi + alt projeleri) → [modules/management-kca.md](modules/management-kca.md).

| Tablo | Nasıl |
| --- | --- |
| `users` | okuma (bağlama: e-posta + `password_hash` doğrulama; ad, `is_admin`, `active`, `is_agent`) |
| `login_attempts` | bağlamada hatalı deneme yazılır / başarıda temizlenir (KCA Panel giriş kilidiyle aynı) |
| `projects`, `project_members` | okuma: kapsam ve proje yetkileri |
| `tasks`, `task_comments`, `task_events`, `task_stars` | okuma + yazma (aç, güncelle / taşı, onay / düzeltme, yorum, sil — KCA Panel `lib/actions.js` ile aynı satırlar) |
| `meetings` | okuma + yazma (sahibi bağlı KCA hesabı; `source = 'crm'`) |
| `contacts` | okuma + yazma, yalnız kendi kişileri (`source = 'Edoras CRM'`) |

