# Runbook

## Migration uygula (CRM projesi)

1. `supabase/migrations/<ts>_<ad>.sql` yaz + `supabase/tests/<ad>.test.ts` (PGlite). `npx vitest run supabase/tests/<ad>.test.ts`.
2. YKS deposunda `infra/tr/tr-migration.sh --crm <dosya>` (kuru deneme), sonra kullanıcı kendi terminalinde `--uygula`. Dosyada dış `begin;/commit;` olmamalı (betik sarar). Donmuş Cloud'a UYGULAMA.
3. `infra/tr/tr-sorgu.sh --crm "select …"` ile tablonun geldiğini doğrula.
4. `data-model.md` tablosuna satır ekle.

## Personel ekle

`npm run staff:add -- ad@edorasapp.ai "Ad Soyad" ADMIN|CRM_AGENT` (geçici şifre bir kez). Sonrası Ayarlar → Ekip.

## Doğrulama

```
npx tsc --noEmit && npx eslint . && npx vitest run --maxWorkers=3 && npx next build
```

Yerel üretim denemesi: `npx next start -p 3107` → `/login` 200, `/api/auth/me` oturumsuz 401, `/api/cron/reports`
CRON_SECRET yoksa 503, `/api/public/surveys/<yanlış>` 404.

## Bağlantı kontrolü (salt okunur)

`Edoras-CRM` klasöründe:

```js
// node --input-type=module -e '…'
process.loadEnvFile(".env.local");
const { default: ws } = await import("ws");
const { createClient } = await import("@supabase/supabase-js");
const opt = { auth: { persistSession: false }, realtime: { transport: ws } };
const crm = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, opt);
const ed = createClient(process.env.EDORAS_SUPABASE_URL, process.env.EDORAS_SUPABASE_SERVICE_ROLE_KEY, opt);
// crm.from("crm_institutions").select("*", { count: "exact", head: true })
// ed.from("institutions").select("id, name, program, is_active").limit(0)  → sütun yoksa hata verir
```

Son sonuç (2026-10-01): 20 CRM tablosu OK; anon anahtarı `crm_institutions`'a 42501 (doğru); Edoras demo tabloları +
`auth_user_email_taken` OK.

## Sorun giderme

| Belirti | Neden / çözüm |
| --- | --- |
| Uçlar `CONFIG_MISSING` | env eksik ya da migration uygulanmamış |
| Testte "Worker exited unexpectedly" | PGlite bellek; `--maxWorkers=3` |
| Node betiğinde "Node.js 20 detected without native WebSocket" | `realtime: { transport: ws }` ver |
| Demo açılışında "demo geri alınamadı" logu | Edoras'ta yarım kurum kaldı → edoras-admin'den elle temizle (`delete_institution_guarded`) |
| Fatura `parasut:pending` | Paraşüt işi sürüyor → birkaç dakika sonra "Yeniden dene" (yeni fatura açmaz) |
| Fatura `parasut:auth:401` | Paraşüt kimlik bilgisi yanlış / API erişimi kapalı |
