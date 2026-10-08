# Kurumlar, demo, lisans, ödeme

Ekran: `/institutions`, `/institutions/[id]`. Sunucu: `lib/server/institutions.ts`, Edoras: `lib/server/edoras.ts`.
Kural: `lib/domain/institutions/{rules,schemas,billing-profile}.ts`. DB: `crm_core` (+ fatura profili `crm_invoices`).

## Liste

Edoras `institutions` + CRM kaydı birleşir. CRM kaydı yoksa "kayda al" (`POST /api/institutions/{id}/enroll`: DEMO ya
da — yalnız ADMIN — UCRETLI). İç kurumlar (Ayarlar → Veri kalitesi) analiz ve görevlerden düşer.

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

Kurum ayrıntısı sağ sütunda "Panel modülleri" kartı (`features/institutions/components/PanelModulesCard.tsx`): Edoras
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
