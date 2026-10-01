# EdorasCRM hafızası — dizin

Edoras'ın şirket içi paneli (kurum / demo / lisans / ödeme / CRM / satış / analiz). DeepSportAdmin'den kopyalanıp
Supabase'e taşındı. Bu klasör ajanlar ve ekip için **modüler hafızadır**: her dosya tek konu, kısa, kod yerine
"neden + nerede". Ayrıntılı kullanım `README.md`'de; ajan kuralları `CLAUDE.md`'de.

> Güncelleme kuralı: bir modülde davranış / kural / env değişince ilgili dosyayı aynı commit'te güncelle, tarih yaz
> (`YYYY-MM-DD`). Yeni modül → `modules/<ad>.md` + bu dizine bir satır.

## Durum (2026-10-01)

- Repo: `C:\Users\erenn\Desktop\Edoras-CRM` → GitHub `kcaisfather/Edoras-CRM`, dal `main`. (Eski `Desktop\EdorasCRM`
  klasörü artık kullanılmıyor; geçmiş buraya taşındı.)
- DeepSport CRM'inin taşınabilir bütün modülleri taşındı; son açık iş olan Paraşüt istemcisi yazıldı (canlı hesapla
  henüz denenmedi).
- CRM projesine 10 migration'ın hepsi uygulandı (son: `crm_invoice_provider_refs`, 2026-10-01).
- Bağlantı kontrolü (2026-10-01): CRM projesi 20 tablo OK, anon anahtarı tablolara erişemiyor (RLS), Edoras canlı okuma OK.
- **Demo açma canlıda hiç çalıştırılmadı** (işlem kaydında `DEMO_CREATED` yok). Şema uyumu salt okunur doğrulandı.
- Vercel'e henüz dağıtılmadı → [reference/deploy-vercel.md](reference/deploy-vercel.md).

## Çekirdek

- Mimari, iki veritabanı, istek akışı → [architecture.md](architecture.md)
- CRM tabloları, migration listesi, Edoras'ta dokunulan tablolar → [data-model.md](data-model.md)
- Roller, yetki, finansal maskeleme, herkese açık / cron yolları → [auth.md](auth.md)
- Kod kalıpları ve konvansiyonlar (route, requireStaff, dbError, audit, compensator, test) → [patterns.md](patterns.md)

## Modüller (`modules/`)

- Kurumlar, demo açma (Edoras'a yazar), lisans, ödeme, fatura profili → [modules/institutions-demo.md](modules/institutions-demo.md)
- CRM adayları, notlar, Satış Analizleri → [modules/crm-leads.md](modules/crm-leads.md)
- Görevler + kural motoru (zamanlayıcısız türetme) → [modules/tasks-rules.md](modules/tasks-rules.md)
- Soğuk listeler + Excel/CSV içe aktarma → [modules/cold-lists-import.md](modules/cold-lists-import.md)
- Anketler (NPS/memnuniyet, herkese açık `/s/[token]`) → [modules/surveys.md](modules/surveys.md)
- Satış ve faturalar (Ödeme Geçmişi, Faturalar, **Paraşüt**) → [modules/sales-invoices.md](modules/sales-invoices.md)
- Müşteri analizleri (Edoras kullanım sinyalleri) → [modules/growth-analytics.md](modules/growth-analytics.md)
- Aktivite geçmişi + Maliyetler → [modules/activity-costs.md](modules/activity-costs.md)
- Zamanlanmış raporlar (cron) → [modules/reports.md](modules/reports.md)
- Ayarlar ve ekip (personel, iç kurumlar, hata kaydı, KVKK) → [modules/settings-team.md](modules/settings-team.md)

## Referans (`reference/`)

- Vercel dağıtımı ve ortam değişkenleri (tam liste) → [reference/deploy-vercel.md](reference/deploy-vercel.md)
- Dış entegrasyonlar: Edoras DB, Paraşüt, Resend → [reference/integrations.md](reference/integrations.md)
- Kurucu kararları + DeepSport'tan bilerek bırakılanlar → [reference/decisions.md](reference/decisions.md)
- Runbook: migration uygula, personel ekle, test, sorun giderme → [reference/runbooks.md](reference/runbooks.md)
