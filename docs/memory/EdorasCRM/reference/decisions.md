# Kararlar

## Kurucu kararları (2026-09-29)

- Yalnız **Türkçe** (next-intl tek dil, URL'de `/tr` yok).
- Müşteri birimi **kurum** (Edoras `institutions`).
- **1 dönem = 1 yıl**; ücretli lisans tek tip.
- **Demo da 1 yıl**, "DEMO" etiketli, uzatma yok; süre dolunca pasife düşmez, yalnız ekranda "Demo bitti".
- Demo için zorunlu: yetkili ad soyad + kurum adı + telefon + e-posta.
- Ücretli hesap ve ödeme (ve fatura) için zorunlu: adres + (TC Kimlik No veya Vergi No).
- İki veritabanı: CRM ayrı Supabase projesinde, Edoras'a da bağlanır ("ikisine de bağlan"). Edoras şemasına dokunulmaz.
- DeepSport'un **tüm** modülleri taşınacak ("tamamen kopyalayalım") — 2026-10-01 itibarıyla tamam.

## Uyarlamalar (DeepSport → Edoras)

- Zamanlayıcı yok → görevler istekte türetilir; tek cron rapor dağıtıcısı.
- E-posta AWS SES yerine Resend REST.
- Soğuk listeler tarayıcıdan veritabanına (ekipçe paylaşılır).
- Rapor alıcıları serbest e-posta değil, aktif personel.
- Paraşüt PDF'i saklanmaz, istekte taze adres.

## DeepSport'tan bilerek alınmayanlar

| DeepSport | Neden |
| --- | --- |
| Antrenör / Takım / Sporcu / Hesaplar ekranları | spora özgü; yerine Kurumlar (öğrenci / sınıf yalnız sayı) |
| `/analytics` telemetri | Edoras'ta telemetri yok |
| Maliyetler: Microservices, Query, Reconcile, AWS CE/CUR, kur | veri kaynağı yok; maliyet elle girilir |
| Genişleme (koltuk / kontenjan), kanal sekmeleri | Edoras'ta kavram yok, tek ürün |
| CAC / ROAS | veri yok |
| Kampanyada e-posta kanalı | onay / abonelikten çıkış kaydı yok |
| "Hiç giriş yapmamış" / giriş logu | Edoras'ta yok; yerine etkinlik |
| En iyi arama saati, kayıtlı görünümler | taşınmadı (görünümler yalnız taşınmayan ekranlardaydı) |
| `/growth`, `/growth/calls`, `/growth/renewals`, `/growth/usage`, `/sales` | DeepSport'ta da yalnız eski adres yönlendirmesi |
| Fatura iptali | DeepSport'ta da yok |
