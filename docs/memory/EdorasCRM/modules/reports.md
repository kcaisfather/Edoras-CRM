# Zamanlanmış raporlar (Ayarlar → Raporlar, yalnız ADMIN)

Uçlar: `/api/reports/subscriptions/**`, `/api/reports/preview`, dağıtıcı `/api/cron/reports` (POST; Vercel Cron için GET).
Sunucu `lib/server/reports.ts`, saf kod `lib/domain/reports/{build,schedule}.ts`. DB `crm_report_subscriptions`, `crm_report_runs`.

- Alıcılar yalnız **aktif CRM personeli** (serbest e-posta yok); adres gönderim anında Auth'tan.
- 6 bölüm: bugünün görevleri, biten / bitecek demolar, 60 gün içinde bitecek paketler, takipteki teklifler, yeni kayıtlar,
  satış toplamı (tahsilat). Dönem: günlük 1 / haftalık 7 / aylık 30 gün.
- Rol süzmesi alıcı başına (her alıcıya ayrı e-posta): CRM_AGENT'a tutar gitmez, görevlerde yalnız kendisininkiler + havuz.
- Zamanlama Europe/Istanbul duvar saati (`Intl`), haftalık ISO gün 1–7, aylık 1–28.
- Dağıtıcı: `Authorization: Bearer ${CRON_SECRET}` (yoksa 503); her abonelik gönderimden önce koşullu güncellemeyle
  "talep edilir" → en fazla bir kez; Resend `Idempotency-Key`. Çağrı başına ≤ 50 abonelik, ~40 sn; `maxDuration = 60`.
- **Vercel Cron** `vercel.json`: `0 5 * * *` (08:00 İstanbul). Hobby'de günde bir kez → abonelik saatinden sonraki ilk
  tetiklemede gider. Saatinde gönderim: Pro + `*/15 * * * *`, ya da harici zamanlayıcı / Supabase pg_cron + pg_net.
- E-posta için `RESEND_API_KEY` + `EMAIL_FROM` şart (yoksa "Şimdi gönder" ve dağıtıcı 503 `MAIL_NOT_CONFIGURED`).
