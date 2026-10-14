# Yönetim (KCA Panel) — Yönetim Görevleri, Network, Toplantı Notları

Kurucu isteği (2026-10-14): "kca-panel.vercel.app ile burayı birleştir; navbarda Yönetim Görevleri - Network - Toplantı
notları; Turso'daki backend burada kullanılsın, KCA Panel ile aynı dataları işlesin, orada yapılan toplantı notlarını
buradan göreyim; Edoras etiketi olmayan hiçbir görevi / toplantı notunu / network'ü görmesin."

Ekran: menü **Yönetim** grubu (CRM grubunun altında — kurucu isteği 2026-10-14) → `/management/tasks`, `/management/network`, `/management/meetings` (açık kayıt URL'de:
`?task=`, `?meeting=`). Uçlar: `/api/management/**` (hepsi `requireStaff()`). Sunucu: `lib/server/kca.ts` (bağlantı, bağ,
işlem kaydı) + `lib/server/kca-store.ts` (kurallar, SQL) + `lib/server/kca-turso.ts` (Hrana HTTP istemcisi). Saf:
`lib/domain/kca/{types,rules,markdown}.ts`. Ekran: `features/management/`. Metin: `messages/features/management.tr.json`.

## Veri nerede

- **KCA Panel'in Turso veritabanında** (repo `kcaisfather/KCAPanel`, `lib/schema.js`). CRM ayrı kopya TUTMAZ: okur ve
  KCA Panel'in kendi işlemleriyle (`lib/actions.js`) aynı satırları yazar (görev geçmişi `task_events`, yorum
  `task_comments`, `updated_at`, `completed_at`…). Burada açılan görev / not / kişi KCA Panel'de anında görünür, tersi de.
- **KCA şeması buradan değiştirilmez** (Edoras şeması gibi). Tablo / sütun adı KCA Panel'de değişirse burası kırılır →
  `kca-test-support.ts`'teki şema kopyasını ve `kca-store.ts`'i birlikte güncelle.
- Bağlantı: Turso HTTP (`POST {url}/v2/pipeline`, Bearer token). npm paketi yok. İstek tek "pipeline"dır, transaction
  değildir (KCA Panel'de de öyle).
- CRM'de tutulan tek şey hesap bağı: `crm_kca_links` (migration `20261014120000_crm_kca_links`).

## Edoras etiketi = kapsam (`loadEdorasScope`)

- Kök: `KCA_EDORAS_PROJECT_ID` (ana proje kimliği) ya da adı "Edoras" olan **tek** ana proje (`nameKey` → `edoras`;
  "Edoras Eski", "EDORAS Mobil" gibi adlar kök değil). Kök bulunamazsa / birden çoksa hiçbir şey gösterilmez
  (`NO_SCOPE`, uçlarda 409 `KCA_SCOPE_MISSING`).
- Kapsam = kök + kökün alt projeleri (KCA Panel projeleri iki katmanlıdır).
- Görev: projesi kapsamda. Toplantı notu: projesi (= "Hangi firmamız için") kapsamda; **projesiz not görünmez**.
  Network kişisi: projesi kapsamda; projesiz kişi görünmez.
- Kapsam dışı kayıt her uçta 404 (varlığı sızdırılmaz); yazımda proje yalnız kapsam içinden seçilir (taşıma dahil).

## Yetki = KCA Panel'in kuralı (bağlı KCA hesabı adına)

- Menü her CRM rolüne açık (`/management` → `CRM_AGENT_PATHS`). Ne görüleceğini CRM rolü değil **KCA hesabı** belirler.
- Görev: KCA yöneticisi tüm Edoras projelerini, diğerleri üyesi olduklarını görür. Bilgi alanı / sorumlu / taşıma / silme /
  onay → `can_create_tasks`; son tarih → `can_edit_due_dates`; durum → görev girme yetkisi ya da görevin sorumlusu.
  Sorumlu projenin üyesi olmalı (`KCA_ASSIGNEE_INVALID`). Onay yalnız "Onay bekliyor" görevde (`KCA_TASK_NOT_REVIEW`).
- Toplantı notu: sahibi görür; "Proje ekibi de görsün" (`shared`) açıksa projeyi gören herkes okur. Düzenle / sil /
  işlendi yalnız sahibi (`KCA_NOT_OWNER`). CRM'den açılan notun sahibi bağlı KCA hesabı, `source = 'crm'`.
- Network kişiye özel: yalnız kendi kişileri (KCA yöneticisi dahil kimse başkasınınkini görmez). CRM'den eklenen kişi
  `source = 'Edoras CRM'`.

## Hesap bağı (`crm_kca_links`)

- E-posta eşleşmesiyle KURULMAZ: CRM'de personel açabilen biri başkasının e-postasıyla hesap açıp onun kişiye özel
  notlarını görmesin. Personel KCA Panel e-postası + şifresini bir kez girer (`POST /api/management/link`); sunucu Turso'daki
  `users.password_hash`'i KCA Panel'in scrypt biçimiyle doğrular. Şifre saklanmaz.
- Hatalı denemeler KCA Panel'in kendi giriş kilidine yazılır (`login_attempts`, 15 dk'da 8 → `KCA_LOGIN_LOCKED`).
- AI ekip (`is_agent`) ve pasif hesap bağlanamaz. Bir KCA hesabı tek personele bağlanır (yeniden bağlanınca eskisi kalkar).
- `kca_password_fp` = KCA şifre özetinin SHA-256'sı; her istekte karşılaştırılır → KCA Panel'de şifre değişince / sıfırlanınca
  ya da hesap pasifleşince bağ düşer (`NOT_LINKED` + neden; uçlar 409 `KCA_NOT_LINKED`).

## İşlem kaydı

Her yazım `crm_audit_logs`'a da düşer (`KCA_*` eylemleri, kayıt türleri `kca_account` / `kca_task` / `kca_meeting` /
`kca_contact`). Yalnız KCA kimliği, proje kimliği, durum, değişen alan adları — görev / toplantı başlığı, not metni, kişi
adı, telefon, e-posta YAZILMAZ (network ve toplantı notu KCA Panel'de kişiye özel; CRM işlem kaydını başka yönetici okur).

## Ekran

- Yönetim Görevleri: proje sekmeleri (Tüm Edoras + projeler), arama, durum süzgeci (açıklar / gecikmiş / tek durum /
  tamamlananlar dahil), "Yalnız benimkiler"; satırda hızlı durum; sağ panelde ayrıntı (durum, sorumlu, son tarih, proje,
  bilgiler, güncellemeler, geçmiş, OK / Düzeltme iste, sil). Onay bekleyenler üstte.
- Toplantı Notları: liste / "Notlar" görünümü; ayrıntıda not KCA Panel biçimiyle (başlık, madde, onay kutusu, tablo —
  `lib/domain/kca/markdown.ts`, HTML basılmaz, bağlantı yalnız http(s)), çıkan görevler, "Görev aç" (toplantıya bağlı),
  "İşlendi say / Yeniden aç". Yeni not: şablon (KCA Panel CLAUDE.md biçimi), Konu / Tarih / Katılanlar boşsa nottaki
  satırlardan; `#toplantı` kodu atılır.
- Network: tablo + sağ panel formu, satırda hızlı durum, "Takip tarihi geçmiş" süzgeci.

## Ortam

`KCA_TURSO_DATABASE_URL` (`libsql://…`, KCA Panel Vercel'deki `TURSO_DATABASE_URL`), `KCA_TURSO_AUTH_TOKEN`
(`TURSO_AUTH_TOKEN`), isteğe bağlı `KCA_EDORAS_PROJECT_ID`. URL yoksa sayfa "ayarlanmamış" der (`NOT_CONFIGURED`), uçlar
503 `CONFIG_MISSING`. Turso'ya ulaşılamazsa 502 `KCA_UNAVAILABLE` (Turso yanıt gövdesi / SQL mesajı taşınmaz).

Canlı (2026-10-14): migration CRM projesine uygulandı, iki Turso değişkeni Vercel Production'da (`KCA_EDORAS_PROJECT_ID`
verilmedi → kök adı "Edoras" olan tek ana proje), üretime CLI ile yayınlandı. Hesap bağını her personel kendisi kurar
(Yönetim → KCA Panel e-posta + şifre).

## Yapılmayanlar (2026-10-14)

- Toplantı notunu yapıştırınca aksiyon tablosundan toplu görev / kişi çıkaran önizleme (KCA Panel `meeting-import.js`)
  yok — KCA Panel'deki AI ekip (`ai = 1`) işler ya da görevler tek tek açılır.
- Yıldız (öncelikli), görev yorum silme, proje / üye yönetimi, WhatsApp — KCA Panel'de kalır.

## Test

`lib/server/kca-store.test.ts` (Node SQLite'ında KCA şeması + Hrana taklidi: kapsam, yetki, yazımlar), `lib/domain/kca/kca.test.ts`
(şemalar, kurallar, Markdown), `supabase/tests/crm-kca-links.test.ts`. 2026-10-14 tarayıcıda uçtan uca denendi (taklit
Supabase + Turso): bağla → görev aç / not / OK → toplantı oku / yaz / işlendi → network → bağı kaldır; Edoras dışı kayıt
hiçbir ekranda görünmedi.
