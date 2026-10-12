# Kurumlar, demo, lisans, ödeme

Ekran: `/institutions`, `/institutions/[id]`. Sunucu: `lib/server/institutions.ts`, Edoras: `lib/server/edoras.ts`.
Kural: `lib/domain/institutions/{rules,schemas,billing-profile}.ts`. DB: `crm_core` (+ fatura profili `crm_invoices`).

## Liste

Edoras `institutions` + CRM kaydı birleşir. CRM kaydı yoksa "kayda al" (`POST /api/institutions/{id}/enroll`: DEMO ya
da — yalnız ADMIN — UCRETLI). İç kurumlar (Ayarlar → Veri kalitesi) analiz ve görevlerden düşer.

## Kurum ayrıntısı ekranı (`/institutions/[id]`, düzen 2026-10-12)

- **Başlık:** ad + durum rozeti + program + yetkili adı; CRM kaydı varsa Ara / WhatsApp / E-posta kısayolu (dar ekranda
  yalnız ikon); birincil eylem (CRM'e kaydet / Ücretliye geçir). Altında **gösterge şeridi** (`StatTile`, `STAT_GRID` =
  `auto-fit minmax(8.5rem)` → kutucuk sayısı değişse de satır dolar, 375 px'te 2 sütun): Öğrenci / Öğretmen / Sınıf
  (Edoras), büyümenin Etkinlik + Son etkinlik kutucukları, Demo ya da Lisans kalan gün + dönem çubuğu (kalan gün
  `institutionStatus` ile aynı → listeyle tutarlı). Kurum Edoras'ta yoksa Edoras kutucukları çizilmez.
- **Sekmeler URL'de** (`?tab=overview|staff|account`, `useUrlParam` → route dosyası `<Suspense>` ile sarılı). Etkin olmayan
  sekme bağlanmaz: öğretmen tablosu (Edoras RPC) yalnız sekme açılınca okunur. "Lisans ve ödeme" yalnız CRM kaydı varsa;
  fatura eksik / lisans yaklaşıyor-bitti / demo bitti ise sekmede uyarı noktası. Dar ekranda kısa sekme adları.
- **Genel bakış:** ana sütun yetkili (ya da "CRM kaydı yok") + `overviewMain` (destek talepleri) + Kurum yöneticileri;
  yan sütun `overviewAside` (CRM adayı, memnuniyet, özellik kullanımı) + Panel modülleri. **Lisans ve ödeme:** lisanslar
  (ücretliye geçiş tarihi burada) + ödemeler | demo + fatura bilgileri.
- Başka modüllerin parçaları `app/institutions/[id]/_components/InstitutionScreen.tsx`'te yuvalara verilir (kurumlar
  modülü onları import etmez). Izgaralar `grid-cols-1` (= `minmax(0,1fr)`): yoksa mobilde destek tablosunun içerik
  genişliği sütunu büyütüp sayfayı yatay taşırıyordu.

## Demo açma — Edoras'a YAZAR (`POST /api/institutions`, her personel)

Sıra (`createDemoInstitution`):
1. Ad Edoras'ta var mı (`isEdorasInstitutionNameTaken`, boşluk/büyük harf duyarsız) → 409 `INSTITUTION_NAME_TAKEN`
2. E-posta Edoras Auth'ta var mı (`auth_user_email_taken`) → 409 `EMAIL_TAKEN`
3. Edoras: `institutions` insert (ad, program `yks`/`lgs`, aktif) → aktif `academic_years` + `academic_terms`
   (`initialAcademicPeriod(bugün)`: Eylül 1'den Ocak sonuna 1. Dönem, Şubat 1–Haziran 30 2. Dönem; örnekler
   `lib/domain/institutions/rules.test.ts`) → Auth kullanıcı (geçici şifre, e-posta
   onaylı) → `profiles` → `institution_users (role 'admin')`
4. CRM: `crm_enroll_institution` (status DEMO, başlangıç bugün, bitiş +1 yıl)
5. `recordAudit(DEMO_CREATED)`; yanıt: giriş e-postası + **geçici şifre (bir kez)** + demo bitişi + panel adresi
   (`NEXT_PUBLIC_EDORAS_PANEL_URL`, varsayılan `https://panel.edorasapp.ai`)

Herhangi bir adım patlarsa compensator Edoras'ta açılanları ters sırayla siler (kurum `delete_institution_guarded` ile).
Zorunlu: yetkili ad soyad + kurum adı + telefon (E.164) + e-posta.

**Durum 2026-10-01:** canlıda hiç çalıştırılmadı (`DEMO_CREATED` kaydı yok). Edoras'ta gereken tablo / sütun / RPC'ler salt
okunur doğrulandı. İlk gerçek demo açılışından sonra edoras-admin panelinde girişi ve aktif dönemi kontrol et.

## Lisans ve ödeme

- 1 dönem = 1 yıl (`[başlangıç, bitiş)`), ücretli lisans tek tip. Yenileme süren lisansın bitişinden başlar (`renewLicense`).
- Ücretliye geçiş (`convert`, ADMIN): adres + (TC ya da VKN) zorunlu; DB `crm_institutions_paid_billing_check`.
- Ödeme (`payments`, ADMIN): aynı bilgiler olmadan alınmaz (`crm_guard_payment`).
- Demo bitince kurum pasife düşmez; yalnız "Demo bitti" rozeti / menü sayacı.

## Lisans fiyatı ve düzeltme (2026-10-05)

Müşteri geri bildirimi: "hesabı ödeme planını düzeltmeden kaydettim, düzenleme bulamadım" + "paket fiyatlarında yalnız
indirim yüzdesi olsun". Kurucu kararı: tek liste fiyatı, satışta indirim %, elle bedel yalnız istisna.

- Liste fiyatı: Ayarlar → Lisans fiyatı (`GET/PUT /api/settings/license-pricing`, ADMIN, tablo `crm_license_pricing`).
  Tanımlı değilse formlar elle bedele geçer; sunucu yüzde modunda 422 `LIST_PRICE_MISSING`.
- Satış formları (ücretliye geçiş, kayda alma, yenileme, lisans düzelt) `LicenseFields`: indirim % + önizleme ya da
  "Bedeli elle yaz". Kural `lib/domain/institutions/pricing.ts` = SQL `crm_licenses_discount_check` (aynı yuvarlama).
  Lisans satış anındaki liste fiyatını (`list_price`) saklar; düzeltmede o, yoksa Ayarlar'daki kullanılır.
- RPC imzaları değişmedi: bedel RPC'ye gider, `list_price` / `discount_percent` ardından `tagLicensePricing` ile yazılır.
- Düzeltme (ADMIN): `PATCH /api/institutions/{id}/licenses/{licenseId}` (başlangıç → bitiş +1 yıl, bedel, not),
  `PATCH|DELETE /api/institutions/{id}/payments/{paymentId}`. İptal edilmemiş faturası olan kayıt değişmez / silinmez
  (`CRM_SALE_INVOICED` → 409 `SALE_INVOICED`); faturası iptal edilmiş ödeme düzeltilir ama FK yüzünden silinmez.
- Bedel değişince kurumun "Satış oldu" adayının satış tutarı (eski bedele eşitse, yeni bedel > 0) tetikleyiciyle düzelir:
  CRM'deki satış / açık bakiye `sale_amount − tahsilat`tan hesaplanır; aksi halde eski tutar kalırdı.

## Fatura profili

`GET/PUT /api/institutions/{id}/billing`. Tür kimlikten türetilir: TC → bireysel, VKN → kurumsal (+ vergi dairesi).
Tam profil = unvan + il + ilçe + fatura e-postası + adres (+ vergi dairesi). E-posta ve Paraşüt faturası tam profil ister.
TC/VKN kontrol hanesi SQL ve TS'te birebir aynı algoritma (test 3.000 örnek).

## Panel modülleri — Edoras'a YAZAR (`GET/PATCH /api/institutions/{id}/modules`, 2026-10-08)

Kurum ayrıntısı Genel bakış yan sütununda "Panel modülleri" kartı (`features/institutions/components/PanelModulesCard.tsx`): Edoras
panelinin ücretli / ek modülleri (ilk modül: Muhasebe, `accounting`) kurum bazında aç / kapa. Sözleşme edoras-admin
migration 300: `panel_modules` katalog (CRM yalnız okur) + `institution_panel_modules` kurum satırı (CRM upsert eder,
`updated_by = crm:<personel adı>`). Satır yoksa katalogdaki `default_enabled` geçerli (`mergePanelModules`,
`lib/domain/institutions/panel-modules.ts` — Edoras `utils/supabase/panel-modules.ts` ile aynı kural).

- Görmek her personel, değiştirmek yalnız ADMIN (`requireStaff({ role: "ADMIN" })`). CRM kaydı ŞART DEĞİL; kurum
  Edoras'ta yoksa kart çizilmez / uç 404. Katalogda olmayan anahtar 404.
- Kapatmak Edoras'ta VERİ SİLMEZ: menü, sayfalar, veri uçları, yetki grubu, mobil ekran ve otomatik hatırlatma kapanır.
  Edoras istek başına önbellekler → değişiklik bir sonraki sayfa yüklemesinde görünür.
- İşlem kaydı `PANEL_MODULE_CHANGED` (details: `module`, `enabled`). Sunucu: `lib/server/panel-modules.ts` →
  `edoras.ts` `getEdorasPanelModules` / `setEdorasPanelModule`. Test: `panel-modules.test.ts`.
- Yeni modül eklemek Edoras işidir (katalog satırı + kod kapısı); CRM kartı katalogdan kendiliğinden listeler.

## Kurum yöneticisi hesapları — Edoras'a YAZAR (yalnız ADMIN, 2026-10-12)

Sorun: demo açılırken yetkili e-postası kurum yöneticisinin Edoras giriş adresi oluyor (`createEdorasDemo`), ama Yetkili
kartında e-posta sonradan değişince yalnız `crm_institutions.contact_email` yazılıyordu → Edoras Auth'ta eski adres
kalıyordu. Kullanıcı kararı: giriş e-postası, şifre sıfırlama ve aktif / pasif CRM'den yönetilsin, yalnız ADMIN.

- **Kart:** Genel bakış → "Kurum yöneticileri" (`AdminsCard`): her satırda giriş türü rozeti (E-posta / Telefon / TC —
  `edorasLoginKind`, `profiles.email`'den), Pasif ve Süper yönetici rozeti; ADMIN'e "⋯" menüsü
  (`features/institutions/components/AdminAccountActions.tsx`). Telefon / TC hesabında e-posta öğesi kapalı + açıklama.
- **Uçlar** (`requireStaff({ role: "ADMIN" })`, ince; iş `lib/server/institution-admin-accounts.ts` → `edoras.ts`):
  - `PATCH /api/institutions/{id}/admins/{userId}` `{ email }` → `updateEdorasAdminEmail`: üyelik kapısı → kurallar (Auth'taki
    GÜNCEL adresle) → `auth_user_email_taken(email, userId)` → Auth `updateUserById({ email, email_confirm: true })` →
    `profiles.email`. Profil yazılamazsa Auth eski adrese döndürülür. Aynı adres → `{ changed: false }` (profil geride kaldıysa
    eşitlenir). Eski adresle giriş hemen biter; şifre ve CRM yetkili bilgisi değişmez.
  - `POST …/admins/{userId}/password` `{}` → demo üreticisiyle 12 karakterlik geçici şifre; yanıtta bir kez
    (`loginIdentifier` — telefonda 0'lı 11 hane, TC'de 11 hane — + şifre + panel adresi). Hiçbir yerde saklanmaz
    (Edoras da `initial_password` saklamıyor).
  - `PATCH …/admins/{userId}/active` `{ active, confirmLastAdmin? }` → `institution_users.is_active` (yalnız bu kurumun admin
    satırı; silme / ban yok — Edoras `setTeacherActiveForAdmin` deseni) + `profiles.is_active` (açılınca true; kapanınca
    yalnız başka aktif personel üyeliği yoksa false). Son aktif yönetici `confirmLastAdmin: true` olmadan 409
    `EDORAS_LAST_ADMIN` (pencere kırmızı uyarı + onay kutusu ister).
- **Kapılar:** `(kurum, kullanıcı, role 'admin')` üyeliği yoksa 404; `profiles.is_super_admin` → 403 `EDORAS_SUPER_ADMIN`;
  Auth adresi `@edoras.com` / `@internal.local` → 409 `EDORAS_LOGIN_NOT_EMAIL`; yeni adres bu alan adlarında → 400
  `VALIDATION` (alan mesajı); başka hesapta → 409 `EMAIL_TAKEN`. E-postalar trim + küçük harf.
- **Kapsam:** Auth hesabı tekildir — değişiklik kişinin başka kurumlardaki üyeliklerine de işler (kart sayıyı gösterir,
  pencere uyarır). Aynı kişi veliyse veli telefon girişi adresi aramayla bulduğu için kırılmaz.
- ⚠️ **Pasif yönetici web paneline girebilir:** YKS `resolve_user_role` / `middleware.ts` / `getAdminInstitutionContext`
  `is_active=false`'u yalnız öğretmende uygular; mobil (`institutionUser.js`) yöneticiyi de içeri almaz. Pencere bunu
  söyler ve şifreyi de sıfırlamayı önerir. Kalıcı çözüm YKS'de (açık iş).
- **Yetkili ↔ giriş eşlemesi:** Yetkili bilgisi penceresinde e-posta değişirken ESKİ yetkili e-postası e-postayla giren bir
  yöneticinin giriş adresiyse (yalnız ADMIN'e) "Panel giriş e-postasını da güncelle" kutusu çıkar (varsayılan işaretli;
  `ContactLoginSync.tsx`). Yetkili kaydından sonra yönetici e-posta ucu çağrılır; o patlarsa yetkili değişikliği kalır,
  toast "Yetkili bilgisi kaydedildi, ama panel giriş e-postası değiştirilemedi: …" der.
- İşlem kaydı (kayıt türü kurum): `EDORAS_ADMIN_EMAIL_CHANGED`, `EDORAS_ADMIN_PASSWORD_RESET` (details `{ userId }`),
  `EDORAS_ADMIN_ACTIVE_CHANGED` (`{ userId, active }`); e-posta / şifre yazılmaz. Değişiklik yoksa kayıt yazılmaz.
- Testler: `lib/domain/institutions/edoras-accounts.test.ts` (giriş türü, ayrılmış alan adları, engeller, son yönetici,
  şemalar). Uç / Edoras istemcisi için sahte istemci deseni repoda yok — canlıda denenmedi.
