# Anketler

Ekran: `/crm/surveys`, herkese açık `/s/[token]`. Uçlar: `/api/crm/surveys/**` (her personel), `/api/public/surveys/**`
(oturumsuz). Sunucu: `lib/server/crm-surveys.ts`, `public-surveys.ts`. DB: `crm_surveys`, `crm_survey_invitations`,
`crm_survey_responses`.

- Puanı yalnız müşteri verir (NPS 0–10, memnuniyet 1–5, yorum ≤ 2000); panelde puan giriş ucu yok.
- Alıcı CRM adayı ve / veya kurum; sunucu iletişim bilgisini kayıttan kendisi okur. Token `randomBytes(32)` base64url.
  Aynı alıcıya 7 gün içinde yanıtsız davet varsa yenisi açılmaz (`reused`).
- Kanallar: **E-posta** Resend (env yoksa kapalı, 503 `MAIL_NOT_CONFIGURED`); **WhatsApp / SMS / Link** sağlayıcısız —
  personel wa.me / sms: / kopyala ile gönderir, "Gönderdim" der.
- Link kökü `NEXT_PUBLIC_APP_URL` (üretimde **mutlaka** tanımla; derlemeye gömülür).
- Herkese açık uçlar asla 401 dönmez (404 / 410 süresi dolmuş / 409 yanıtlanmış / 429); oran sınırı bellek içi
  (`lib/server/rate-limit.ts`) — Vercel'de örnek başına çalışır, paylaşılan depo yok (kabul edilmiş zayıflık).
- Zamanlayıcı yok: süre dolumu okurken hesaplanır.
- Memnuniyet rozeti (adaylar, kurum ayrıntısı); Görevlerim'de "Anket araması". Eleştirmen yanıtında otomatik ticket yok.
