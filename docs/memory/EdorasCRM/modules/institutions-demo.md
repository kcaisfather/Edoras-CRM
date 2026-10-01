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

## Fatura profili

`GET/PUT /api/institutions/{id}/billing`. Tür kimlikten türetilir: TC → bireysel, VKN → kurumsal (+ vergi dairesi).
Tam profil = unvan + il + ilçe + fatura e-postası + adres (+ vergi dairesi). E-posta ve Paraşüt faturası tam profil ister.
TC/VKN kontrol hanesi SQL ve TS'te birebir aynı algoritma (test 3.000 örnek).
