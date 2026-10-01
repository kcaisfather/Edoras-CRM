# Kalıplar ve konvansiyonlar

## Uç (route handler)

```ts
export const dynamic = "force-dynamic";
export const POST = route(async (request: Request, { params }: Ctx) => {
  const staff = await requireStaff({ role: "ADMIN" }); // ilk satır
  assertSameOrigin(request);                            // yazan uçlarda
  const id = requireUuid((await params).id);
  const body = await parseBody(request, schema);        // zod
  return ok(await doThing(id, body, staff), 201);
});
```

- Hata: `throw new HttpError(status, "KOD")`; kod `lib/api/error-codes.ts`'e, metni `messages/tr.json` →
  `common.errors.codes`'a eklenir. SQL'deki `raise exception 'CRM_…'` → `lib/api/db-errors.ts` eşlemesi.
- Uzun süren uçta `export const maxDuration = 60` (rapor dağıtıcı, "Şimdi gönder", fatura oluştur / yeniden dene).
- Çift tıklama / ağ tekrarı: `Idempotency-Key` (fatura) ya da koşullu güncelleme ile "talep et" (rapor, fatura retry).

## Sunucu veri erişimi

- `lib/server/<modül>.ts` → `import "server-only"`; CRM için `getSupabaseAdminClient()`; Edoras yalnız `edoras.ts` /
  `edoras-usage.ts`. Hata → `throw dbError(error)`.
- Her yazımdan sonra `recordAudit(staff, { action, entityType, entityId, entityLabel, details })` (kişisel veri yok).
- İki DB'ye yayılan yazım: `createCompensator()` → her başarılı adımda `compensator.push(ad, geriAl)`, hata olursa
  `rollback()` (ters sıra), geri alınamayan adım loga.
- Dış API istemcisi test edilebilir olsun diye `fetch` / `sleep` dışarıdan verilir ve `server-only` içermez
  (`lib/server/parasut-client.ts`); env okuyan bağlantı ayrı dosyada (`invoices.ts`).

## Migration

- Dosya: `supabase/migrations/<yyyymmddhhmmss>_<ad>.sql`, dış `begin; … commit;`, sonunda geri alma bloğu.
- Önce PGlite testi: `supabase/tests/<ad>.test.ts` (`createTestDb()` tüm migration'ları sırayla uygular,
  `helpers(db).failure()` kısıt adını / hata metnini döndürür). Her kural için test.
- Sonra CRM projesine MCP `supabase-crm` → `apply_migration` (dış begin/commit çıkarılarak). → [reference/runbooks.md](reference/runbooks.md)
- Kural değişince üç yer birlikte: `lib/domain/<modül>/{rules,schemas}.ts`, migration, testler.

## Ekran

- DeepSport'tan taşınan kodda `@/i18n/routing` → `@/lib/navigation`.
- Başka feature'a yalnız `features/<ad>/index.ts` üzerinden erişilir.
- Yeni metin dosyası `i18n/request.ts` → `loadFeatureMessages`'e eklenir.

## Dosya biçimi

Depoda CRLF ve LF karışık. Toplu düzenleme betiği yazarken satır sonunu koru (CRLF dosyada `\r\n`'i normalize edip geri
yaz); Windows'ta `python` takılabiliyor, Node betiği kullan.

## Test ve doğrulama

`npx tsc --noEmit` · `npx eslint .` · `npx vitest run --maxWorkers=3` · `npx next build`. Varsayılan işçi sayısıyla PGlite
testleri bu makinede belleği aşıp işçiyi düşürebiliyor ("Worker exited unexpectedly") — test hatası değil, işçiyi azalt.
Canlı veritabanlarına test yazımı yapılmaz.
