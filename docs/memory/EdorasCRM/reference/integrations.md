# Dış entegrasyonlar

## Edoras canlı veritabanı (`bmjkpxbrmwxuildwakly`)

- Yalnız sunucudan, `service_role` ile, yalnız `lib/server/edoras.ts` + `lib/server/edoras-usage.ts`.
- Yazma yalnız şu işlerde: demo açma (kurum, yıl, dönem, yönetici) ve onun geri alması; panel modülü
  (`institution_panel_modules` upsert); **kurum yöneticisi hesapları** (2026-10-12, yalnız ADMIN): giriş e-postası
  (Auth `updateUserById` + `profiles.email`), şifre sıfırlama (Auth), bu kurumdaki üyeliğin aktifliği
  (`institution_users.is_active` + `profiles.is_active`). Kurumun kendi `is_active`'ine dokunulmaz.
- Kurum yöneticisi hesap kuralları (`lib/domain/institutions/edoras-accounts.ts`): telefonla giren hesap
  `<10 hane>@edoras.com`, TC ile giren `<11 hane>@internal.local` (YKS `lib/login-identifier.ts`) — bu hesapların adresi
  değiştirilmez (giriş kırılır), yeni adres bu alan adlarında olamaz (başkasının telefon / TC kimliği). Süper yönetici
  (`profiles.is_super_admin`) hiç değiştirilmez. Canlı (2026-10-12): 12 yönetici hesabının 4'ü telefon, 1'i TC.
- ⚠️ YKS web paneli `institution_users.is_active=false`'u yalnız öğretmende uygular (`resolve_user_role`, `middleware.ts`,
  `getAdminInstitutionContext` yönetici için bakmıyor) → CRM'den pasife alınan yönetici mobil uygulamaya giremez ama web
  paneline girebilir. Kesin kapatmak için şifreyi de sıfırla; kalıcı çözüm YKS'de.
- Şema değişikliği YKS reposunda (`Desktop/YKS/supabase/migrations`, son: 267 — 2026-10-01). Edoras'ta tablo / sütun
  adı değişirse demo açma, hesap işlemleri ve kullanım okuması kırılır → YKS'de `institutions`, `academic_years`,
  `academic_terms`, `profiles` (`email`, `is_active`, `is_super_admin`), `institution_users`, `auth_user_email_taken`,
  `delete_institution_guarded`, `lib/login-identifier.ts` (telefon / TC alan adları) değişikliklerini takip et.
- Hızlı salt okunur kontrol betiği: [runbooks.md](runbooks.md) → "Bağlantı kontrolü".

## KCA Panel (Turso) — Yönetim (2026-10-14)

- `kca-panel.vercel.app` (repo `kcaisfather/KCAPanel`): Kamil'in çok şirketli proje / görev paneli; Vercel + Turso, npm
  bağımlılığı yok. CRM aynı Turso veritabanına doğrudan bağlanır (`lib/server/kca-turso.ts`, Hrana v2 HTTP), KCA Panel'in
  API'sine (`/api/rpc`) değil — RPC çerez oturumu ister, API anahtarı yalnız AI ekibe verilir.
- Yalnız `lib/server/kca.ts` + `kca-store.ts`; KCA şeması değiştirilmez. KCA Panel `lib/schema.js` / `lib/actions.js`
  değişirse (tablo, sütun, görev geçmişi türleri, şifre biçimi) `kca-store.ts` + `kca-test-support.ts` birlikte güncellenir.
- Ayrıntı → [../modules/management-kca.md](../modules/management-kca.md).

## Paraşüt (fatura)

- API v4, `https://api.parasut.com`, şema `https://apidocs.parasut.com/swagger.json`.
- İstemci `lib/server/parasut-client.ts`; akış ve hata kodları → [../modules/sales-invoices.md](../modules/sales-invoices.md).
- Kimlik: Paraşüt'ten API erişimi istenir (client id / secret); kullanıcı adı / şifre Paraşüt'e giren hesabınki;
  şirket id panel adresindeki sayı.
- PDF adresi 1 saat geçerli, müşteriyle doğrudan paylaşılmaz (Paraşüt uyarısı) → yalnız panel içi yönlendirme.

## Resend (e-posta)

- `lib/server/mail.ts`, REST (SDK yok), `RESEND_API_KEY` + `EMAIL_FROM`. Yoksa e-posta kanalları kapalı (503).
- Kullananlar: anket daveti, rapor e-postası, fatura talebi. `onboarding@resend.dev` bilinçli olarak yok.
- Edoras'ın Resend anahtarını kopyalamak kullanıcı onayı ister.

## Supabase MCP

`.mcp.json` → `supabase-crm` (yalnız CRM projesi). Edoras projesine MCP bağlantısı yok (bilinçli).
