# Kararlar

## Kurucu kararları (2026-09-29)

- Yalnız **Türkçe** (next-intl tek dil, URL'de `/tr` yok).
- Müşteri birimi **kurum** (Edoras `institutions`).
- **1 dönem = 1 yıl**; ücretli lisans tek tip.
- ~~**Demo da 1 yıl**, uzatma yok~~ → 2026-10-12'de değişti (aşağıda). "DEMO" etiketli; süre dolunca pasife düşmez, yalnız
  ekranda "Demo bitti".
- Demo için zorunlu: yetkili ad soyad + kurum adı + telefon + e-posta.
- Ücretli hesap ve ödeme (ve fatura) için zorunlu: adres + (TC Kimlik No veya Vergi No).
- İki veritabanı: CRM ayrı Supabase projesinde, Edoras'a da bağlanır ("ikisine de bağlan"). Edoras şemasına dokunulmaz.
- DeepSport'un **tüm** modülleri taşınacak ("tamamen kopyalayalım") — 2026-10-01 itibarıyla tamam.

## Demo süresi kurum bazlı (kurucu, 2026-10-12)

İstek: "demo süresi kurum bazlı değişebilsin, sistemde sabit bir şey olmasın". Seçilen:

- Süre **her demo açılışında seçilir**: hızlı seçim 14 gün / 1 ay / 3 ay / 1 yıl ya da özel bitiş tarihi. Hazır /
  varsayılan süre YOK — hiçbir seçim önceden işaretli gelmez, alan zorunlu; veritabanı bitişsiz demoyu reddeder
  (`CRM_DEMO_END_REQUIRED`). CRM'e kaydetmede (CRM öncesi demo) hızlı seçimler girilen başlangıçtan sayılır.
- Açık demonun bitişini sonradan **yalnız ADMIN** değiştirir (uzatma da kısaltma da; bugünden önceye çekilirse demo hemen
  bitmiş sayılır, kurum kapanmaz). İşlem kaydı `DEMO_END_UPDATED` (başlangıç, önceki / yeni bitiş).
- Lisans değişmedi: 1 dönem = 1 yıl.
- Satışla hesap açma (aday → "Satış oldu") kurumu önce DEMO olarak kayda alıp aynı zincirde ücretliye geçirdiği için
  orada süre seçilmez; teknik bitiş başlangıç + 1 gün (`saleDemoEndDate`) — yalnız geçmiş olarak kalır, gösterilmez.
- Kod: `lib/domain/institutions/demo-duration.ts`, SQL `20261012120000_crm_demo_duration`.

## KCA Panel birleşmesi — Yönetim (kurucu, 2026-10-14)

İstek: "kca-panel.vercel.app ile burayı birleştir: Yönetim Görevleri - Network - Toplantı notları; Turso'daki backend
burada kullanılsın, aynı dataları işlesin; Edoras etiketi olmayan hiçbir görevi / toplantı notunu / network'ü görmesin."
Seçilen:

- Veri KCA Panel'in Turso'sunda kalır, CRM doğrudan okur / yazar (kopya / eşitleme yok → iki panel hep aynı).
- "Edoras etiketi" = KCA'daki "Edoras" ana projesi + alt projeleri; projesiz toplantı / kişi Edoras sayılmaz.
- Yetki KCA Panel'in kuralı (network kişiye özel, toplantı sahibine ait); CRM personeli KCA hesabını şifresiyle bağlar
  (e-posta eşleşmesi yok). Menü her CRM rolüne açık; veriyi KCA hesabı belirler.
- Kod: `lib/server/kca*.ts`, `lib/domain/kca/`, `features/management/`; SQL `20261014120000_crm_kca_links`.

## Uyarlamalar (DeepSport → Edoras)

- Zamanlayıcı yok → görevler istekte türetilir; tek cron rapor dağıtıcısı.
- **2026-10-12: Görevlerim tamamen elle.** Kurallar görev üretmez (`RULE_TASKS_ENABLED = false`, motor duruyor); görev
  yalnız elle eklenir / kaldırılır (kaldırma: ekleyen, atanan, ADMIN). → [modules/tasks-rules.md](../modules/tasks-rules.md)
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
