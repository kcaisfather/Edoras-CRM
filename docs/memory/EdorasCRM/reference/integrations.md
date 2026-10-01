# Dış entegrasyonlar

## Edoras canlı veritabanı (`bmjkpxbrmwxuildwakly`)

- Yalnız sunucudan, `service_role` ile, yalnız `lib/server/edoras.ts` + `lib/server/edoras-usage.ts`.
- Yazma yalnız demo açmada (kurum, yıl, dönem, yönetici) ve onun geri almasında. Başka hiçbir iş Edoras'a yazmaz;
  `is_active`'e dokunulmaz.
- Şema değişikliği YKS reposunda (`Desktop/YKS/supabase/migrations`, son: 267 — 2026-10-01). Edoras'ta tablo / sütun
  adı değişirse demo açma ve kullanım okuması kırılır → YKS'de `institutions`, `academic_years`, `academic_terms`,
  `profiles`, `institution_users`, `auth_user_email_taken`, `delete_institution_guarded` değişikliklerini takip et.
- Hızlı salt okunur kontrol betiği: [runbooks.md](runbooks.md) → "Bağlantı kontrolü".

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
