# Vercel dağıtımı ve ortam değişkenleri

Durum (2026-10-01): **dağıtıldı** — Vercel ekibi `kamil-nissas-projects`, proje `edorascrm`, adres
`https://edorascrm.vercel.app` (GitHub `main`'e bağlı, her push üretime gider; yerel klasör `vercel link` ile bağlı,
`.vercel/` git dışı). Production env'leri eklendi: Supabase CRM (3), Edoras (2), `NEXT_PUBLIC_EDORAS_PANEL_URL`,
`NEXT_PUBLIC_APP_URL=https://edorascrm.vercel.app`, `CRON_SECRET` (aynı değer yerel `.env.local`'da). **Eksik:** Resend
(`RESEND_API_KEY`, `EMAIL_FROM`), `ACCOUNTANT_EMAIL`, `PARASUT_*`. Preview ortamına env eklenmedi (CLI dal adı istiyor).
Özel alan adı bağlanınca `NEXT_PUBLIC_APP_URL`'i değiştirip yeniden dağıt. Framework: Next.js 16 (otomatik algılanır), build `next build`, Node 20+ (22 önerilir).
`vercel.json` yalnız cron içerir. Tüm değişkenler **Production** (+ istenirse Preview) ortamına eklenir. `NEXT_PUBLIC_*`
derlemeye gömülür → değiştirince yeniden dağıt.

## Zorunlu

| Değişken | Değer / nereden | Gizli |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://orishbqniebbgdanazrp.supabase.co` | hayır |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | CRM projesi → API Keys → anon / publishable (`.env.local`'da var) | hayır |
| `SUPABASE_SERVICE_ROLE_KEY` | CRM projesi → API Keys → service_role (`.env.local`'da var) | **evet** |
| `EDORAS_SUPABASE_URL` | `https://bmjkpxbrmwxuildwakly.supabase.co` | hayır |
| `EDORAS_SUPABASE_SERVICE_ROLE_KEY` | edoras-admin `.env.local` (`.env.local`'da var) | **evet** |
| `NEXT_PUBLIC_APP_URL` | panelin üretim adresi, ör. `https://crm.edorasapp.ai` (anket linkleri bunu kullanır) | hayır |
| `CRON_SECRET` | `openssl rand -hex 32` ile üret; Vercel Cron Bearer başlığını kendisi ekler | **evet** |

## Önerilen / isteğe bağlı

| Değişken | Ne açar | Gizli |
| --- | --- | --- |
| `NEXT_PUBLIC_EDORAS_PANEL_URL` | demo giriş bilgisindeki panel adresi (boşsa `https://panel.edorasapp.ai`) | hayır |
| `RESEND_API_KEY` + `EMAIL_FROM` | anket e-postası, rapor e-postaları, fatura e-posta talebi. `EMAIL_FROM` Resend'de doğrulanmış alan adından, ör. `Edoras <crm@edorasapp.ai>` | anahtar **evet** |
| `ACCOUNTANT_EMAIL` | "Fatura kes → E-posta ile talep" (Resend de gerekir) | hayır |
| `PARASUT_CLIENT_ID`, `PARASUT_CLIENT_SECRET`, `PARASUT_USERNAME`, `PARASUT_PASSWORD`, `PARASUT_COMPANY_ID` | "Platforma aktar" (beşi birden) | secret + şifre **evet** |
| `PARASUT_PRODUCT_ID` | faturadaki hizmet (boşsa `EDORAS-LISANS` kodlu hizmet açılır) | hayır |

## Dağıtım sonrası

1. Supabase CRM projesi → Authentication → URL Configuration: Site URL ve Redirect URL'e üretim adresini ekle (şifre
   sıfırlama bağlantıları için).
2. `/login` → yönetici girişi; Kurumlar listesi Edoras'tan geliyorsa iki DB bağlantısı tamam.
3. Ayarlar → Raporlar → "Şimdi gönder" ile Resend'i dene.
4. Cron: Vercel → Settings → Cron Jobs'ta `/api/cron/reports` görünmeli. Hobby planında günde bir kez.
5. Fatura uçları `maxDuration = 60` (Hobby'de izinli). Anket oran sınırı bellek içi → sunucusuz örnek başına çalışır.
6. Supabase güvenlik danışmanı: Auth → "Leaked password protection" kapalı (WARN) — açılması önerilir.
