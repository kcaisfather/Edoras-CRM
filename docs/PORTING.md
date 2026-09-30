# DeepSportAdmin → EdorasCRM modül taşıma kılavuzu

DeepSportAdmin (`C:\Users\erenn\Desktop\DeepSportAdmin`) Spring API'ye bağlı bir paneldir. EdorasCRM aynı arayüzü
**Supabase + Next.js route handler** üzerinde çalıştırır. Önce `README.md` ve `CLAUDE.md`'yi okuyun; bu dosya
modül taşırken izlenecek yolu anlatır.

## 1. Temel strateji: DeepSport'un backend sözleşmesini gerçekle, bayrağı aç

DeepSport'un ekranları, backend'de henüz olmayan uçlar için `lib/constants/backend.ts` → `BACKEND_FEATURES`
bayraklarıyla iki yol taşır: bayrak **açıkken** gerçek uçlar, **kapalıyken** geçici çözümler (localStorage,
not öneki `[TAKIP|…]`, `[TAHSILAT|…]` gibi). Uçların beklenen şekli `docs/backend-requests.md` ve
`docs/backend-yapilacaklar.md`'de yazılıdır.

EdorasCRM'de:
- Sözleşmedeki varlıkları **CRM projesinde gerçek tablolar** olarak kurun (not öneki, localStorage yok).
- Uçları `app/api/<modül>/...` altında Next route handler olarak yazın; yanıt şekli, ekranın beklediği DTO ile aynı olsun.
- Ekran kodunda bayrağın **açık** yolunu bırakın, kapalı yolun geçici çözümlerini silin. `BACKEND_FEATURES`
  EdorasCRM'de yoktur; bayrak kontrollerini kaldırıp gerçek yolu doğrudan kullanın.
- Ekranları mümkün olduğunca **kopyalayın** (görünüm, akış ve metinler aynı kalsın); yalnız veri katmanını ve
  Edoras'a uymayan kavramları değiştirin.

## 2. Kavram eşlemesi

| DeepSport | EdorasCRM |
| --- | --- |
| Antrenör / kullanıcı (`userId`, trainer) | **Kurum** (Edoras `institutions.id`) |
| Okul (`school`), kulüp (`club`) | Kurum; kurum grubu yok |
| Sporcu (athlete) | Öğrenci — kişisel veri CRM'e **gelmez**, yalnız sayılar |
| Takım | Sınıf (yalnız sayı) |
| Paket / ürün (`product`, plan, DeepPro) | **1 yıllık lisans** (`crm_licenses`, 1 dönem = 1 yıl) |
| Demo sporcu / demo kotası | **Demo kurum** (1 yıl; `crm_institutions.status = 'DEMO'`) |
| Ödeme kaydı (`product-logs`) | `crm_payments` |
| Kanal (clinic / atletik / trainer) | Yok (kaldırın) |
| Test sayısı, son test | Edoras kullanımı (öğrenci/öğretmen/sınıf sayısı; ileride deneme/ödev) |
| AWS SES e-posta | Resend REST (`lib/server/mail.ts`, `RESEND_API_KEY` + `EMAIL_FROM` isteğe bağlı; yoksa e-posta kanalı kapalı, 503 `MAIL_NOT_CONFIGURED`; fatura talebi ayrıca `ACCOUNTANT_EMAIL` ister). Demo giriş bilgisi gibi tek seferlik bilgiler yine ekranda gösterilir |
| Herkese açık sayfa (`/[locale]/s/...`, `PUBLIC_PATH_PREFIXES`) | `/s/...` + `/api/public/*` (`lib/permissions.ts` → `CUSTOMER_PUBLIC_PATHS`): proxy oturuma dokunmaz, kabuk yok, uçlar token'la korunur ve oran sınırlıdır (`lib/server/rate-limit.ts`) |

## 3. Katmanlar ve dosya yerleri

| Katman | Yer | Kural |
| --- | --- | --- |
| Migration | `supabase/migrations/<yyyymmddhhmmss>_<ad>.sql` | CRM projesine. RLS açık, politika yok, `service_role`'e grant; fonksiyonlar PUBLIC'ten revoke. Kural CHECK/tetikleyici ile de zorunlu. Dış `begin; … commit;` ile sarın. |
| Migration testi | `supabase/tests/<ad>.test.ts` | `harness.ts` → `createTestDb()` tüm migration'ları sırayla uygular. Her kural için test. |
| Saf alan kodu | `lib/domain/<modül>/` | Framework'süz (zod serbest), testli. DeepSport `lib/domain/*`'dan kopyalanır. |
| Sunucu veri erişimi | `lib/server/<modül>.ts` | `import "server-only"`. CRM için `getSupabaseAdminClient()`, Edoras için yalnız `lib/server/edoras.ts`. Hata → `dbError(error)`. Yazmadan sonra `recordAudit(...)`. |
| Uçlar | `app/api/<modül>/**/route.ts` | `route(async …)` sarmalayıcı; ilk satır `requireStaff()` (ADMIN işi `requireStaff({ role: "ADMIN" })`); gövde `parseBody(request, schema)`; yol parametresi `requireUuid`. `export const dynamic = "force-dynamic"`. |
| İstemci veri katmanı | `features/<modül>/api.ts`, `queries.ts`, `mutations.ts` | `apiRequest` (`lib/api/client.ts`). React Query anahtarları modülde. |
| Ekranlar | `features/<modül>/components/` | DeepSport'tan kopya. `@/i18n/routing` → `@/lib/navigation`. Başka feature'a yalnız `index.ts` üzerinden. |
| Sayfa | `app/<yol>/page.tsx` | `<div className="container mx-auto p-6">`; `useSearchParams`/`useUrlParam` kullanan sayfayı `<Suspense>` ile sarın. |
| Metinler | `messages/features/<ad>.tr.json` | `i18n/request.ts` → `loadFeatureMessages`'e bir satır. DeepSport'taki ad alanı adını koruyun (ör. `crm`, `crmx` birleşimi). |
| Menü / yetki | `components/navigation.tsx` → `NAV_GROUPS`; `lib/permissions.ts` → `CRM_AGENT_PATHS` | DeepSport'taki grup ve rol görünürlüğünü koruyun. |
| Hata kodları | `lib/api/error-codes.ts`, `lib/api/db-errors.ts`, `messages/tr.json` → `common.errors.codes` | SQL'deki `raise exception 'CRM_…'` → koda eşleyin. |

## 4. Güvenlik ve veri kuralları (pazarlıksız)

- CRM_AGENT'a tutar (teklif, satış, tahsilat, lisans bedeli, ödeme), TC/VKN ve adres **sunucuda** boşaltılır.
  Arayüzde `FinancialOnly` / `canSeeFinancials` ayrıca gizler.
- Kişisel veri işlem kaydının `details` alanına yazılmaz.
- Veritabanı hata metni (`details`) istemciye ya da loga gitmez; `dbError` kullanın.
- **Canlı veritabanlarına test yazımı yapmayın.** Migration'ı uygulamayın (ana oturum MCP ile uygular), commit atmayın.
- Edoras şemasını değiştirmeyin. Edoras'tan okunacak yeni veri gerekiyorsa `lib/server/edoras.ts`'e fonksiyon ekleyin.

## 5. Bitti sayılmak için

1. `npx tsc --noEmit` temiz, `npx eslint .` temiz (uyarı dahil), `npx vitest run` yeşil, `npx next build` başarılı.
2. Yeni migration için PGlite testi; saf alan kodu için birim testi (DeepSport'taki testleri taşıyın).
3. README'deki "Taşınan modüller" tablosu güncel.
4. Rapor: eklenen tablolar/uçlar/sayfalar, DeepSport'tan farklar ve nedenleri, bilinen eksikler.
