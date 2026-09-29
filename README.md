# Edoras CRM

Edoras'ın şirket içi yönetim paneli: kurumlar, demo hesaplar, lisanslar ve ödemeler.
DeepSportAdmin'in iskeleti (kabuk, UI kiti, liste altyapısı, rol yapısı) üzerine kuruldu. Veri katmanı
Spring API yerine Supabase. Panel yalnız Türkçedir.

- **Müşteri birimi:** kurum (Edoras'taki `institutions`)
- **Roller:** `ADMIN` her şeyi yapar; `CRM_AGENT` demo açar, iletişim bilgisini düzenler, tutar/TC/VKN görmez
- **Yapı:** Next.js 16 · React 19 · TanStack Query · Tailwind v4 · next-intl (yalnız `tr`) · Supabase

## İki veritabanı

| | CRM projesi (`orishbqniebbgdanazrp`) | Edoras (`bmjkpxbrmwxuildwakly`) |
| --- | --- | --- |
| Ne | EdorasCRM'in kendi projesi | edoras-admin ve mobilin canlı veritabanı |
| İçinde | CRM personel girişi (Auth), `crm_staff`, `crm_institutions`, `crm_licenses`, `crm_payments` | Kurumlar, kullanıcılar, öğrenciler… |
| CRM ne yapar | Okur ve yazar (migration bu projeye) | Kurum listesi ve kullanım sayılarını okur; demo açarken kurum + aktif dönem + kurum yöneticisi oluşturur |
| Şema değişikliği | `supabase/migrations/` | **Yok.** Edoras şemasına dokunulmaz |

- Edoras'a dokunan kodun tamamı `lib/server/edoras.ts` içinde.
- `crm_institutions.institution_id` Edoras kurumunun id'sidir (iki veritabanı arasında FK yok). Kurum adı kayıt
  anında saklanır. Edoras'ta silinen bir kurum CRM'den düşmez, "Edoras'ta yok" olarak görünür; lisans ve
  ödemeleri korunur.
- **Demo açma iki veritabanına yayılır, tek transaction değildir.** Her adım geri alma işini kaydeder
  (`lib/server/compensation.ts`). CRM kaydı dahil herhangi bir adım hata verirse Edoras'ta açılan kurum,
  dönem, üyelik ve kullanıcı silinir. Kurum satırı Edoras'ın silme korumasına takılmasın diye
  `delete_institution_guarded(id, ad)` ile silinir (edoras-admin migration 192). Geri alınamayan adım olursa
  sunucu loguna yazılır.

## Kurallar

Kurallar üç katmanda zorunludur: form (zod) → sunucu (`/api`) → veritabanı (CHECK kısıtları ve tetikleyiciler).
Sunucu `service_role` ile bağlandığı için RLS kuralları korumaz. Bu yüzden kural veritabanında da durur.

| Kural | Veritabanında (CRM projesi) |
| --- | --- |
| 1 dönem = 1 yıl; ücretli lisans 1 dönemdir | `crm_licenses_one_year_check` |
| Demo da 1 dönemdir (1 yıl), etiketi **DEMO**'dur; uzatılmaz | `crm_institutions_demo_dates_check` |
| Yetkili ad soyad + kurum adı + telefon + e-posta olmadan demo açılamaz | `crm_institutions_contact_*_check`, `institution_name` |
| Demo süresi dolunca kurum **pasife düşmez**, yalnız ekranda "Demo bitti" görünür | — (hiçbir iş Edoras'ta `is_active`'e dokunmaz) |
| Adres + (TC Kimlik No veya Vergi No) olmadan ücretli hesap açılamaz | `crm_institutions_paid_billing_check` |
| Aynı bilgiler olmadan ödeme alınamaz | `crm_guard_payment` tetikleyicisi |

TC ve Vergi No kontrol haneleriyle doğrulanır; algoritma SQL (`crm_is_valid_tckn/vkn`) ve TypeScript'te
(`lib/domain/institutions/rules.ts`) birebir aynıdır. Test bunu 3.000 örnekle karşılaştırır.

## Kurulum

1. `npm install`
2. `.env.local` (örnek: `.env.example`):
   - CRM projesi: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - Edoras: `EDORAS_SUPABASE_URL`, `EDORAS_SUPABASE_SERVICE_ROLE_KEY` (edoras-admin'in `.env.local`'ındaki değerler)
3. **Migration'ı CRM projesine uygulayın** (bir kez): `supabase/migrations/20260929120000_crm_core.sql`.
   Bu repoda Supabase MCP tanımlı (`.mcp.json` → `supabase-crm`, yalnız CRM projesine bağlı). Ya da SQL Editor'dan çalıştırın.
   Dosyanın sonunda geri alma bloğu var.
4. İlk yönetici: `npm run staff:add -- ornek@edorasapp.ai "Ad Soyad" ADMIN`. CRM projesinde kullanıcıyı açar
   ve geçici şifreyi bir kez gösterir. Satış temsilcisi eklemek için son değeri `CRM_AGENT` yapın.
5. `npm run dev` → http://localhost:3000

Ortam değişkeni ya da migration eksikse panel açılır ama uçlar `CONFIG_MISSING` döner.

## Komutlar

| Komut | Ne yapar |
| --- | --- |
| `npm run dev` | Geliştirme sunucusu |
| `npm run build` | Üretim derlemesi |
| `npm test` | Birim testleri + migration testi (PGlite, bellek içi Postgres; hiçbir projeye dokunmaz) |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm run staff:add -- <e-posta> "<Ad Soyad>" [ADMIN\|CRM_AGENT]` | CRM kullanıcısı ekler / rolünü günceller |

## Mimari

```
Tarayıcı (React Query) ──► /api/* (Next route handler)
                              │ requireStaff(): CRM oturumu + crm_staff kaydı
                              ├──► CRM projesi (service_role): crm_* tabloları, RPC'ler
                              └──► Edoras (service_role, lib/server/edoras.ts): kurumlar, demo açma
```

- `proxy.ts` oturum çerezini tazeler, oturumsuz isteği `/login`'e yollar.
- Tarayıcıdaki Supabase istemcisi yalnız giriş/çıkış/şifre içindir. Veri her zaman `/api` üzerinden gelir.
- CRM_AGENT'a tutar, TC/VKN ve adres **sunucuda** boşaltılır; yalnız arayüzde gizlenmez.
- Geçici şifre yalnız demo açma yanıtında gösterilir, hiçbir yerde saklanmaz.
- Node 20'de supabase-js WebSocket ister; sunucu istemcilerine `ws` verilir (`lib/supabase/realtime.ts`).

## Klasörler

| Yol | İçerik |
| --- | --- |
| `app/` | Sayfalar ve `/api` uçları |
| `features/<ad>/` | Ekran bileşenleri, sorgular (`queries.ts`), yazımlar (`mutations.ts`); dışarıya `index.ts` |
| `lib/domain/` | Saf iş kuralları (framework'süz, testli) |
| `lib/server/` | Sunucu veri erişimi (`server-only`); Edoras erişimi yalnız `edoras.ts` |
| `lib/api/` | İstemci ve sunucu API yardımcıları, hata kodları |
| `components/` | Kabuk (menü, üst bar, komut paleti) ve UI kiti |
| `messages/tr.json` | Tüm metinler |
| `supabase/` | CRM projesinin migration'ı ve testi |
| `scripts/` | `add-staff.mjs` |

## DeepSportAdmin'den sıradaki modüller

Taşındıkça `components/navigation.tsx` → `NAV_GROUPS` ve `lib/permissions.ts` → `CRM_AGENT_PATHS` güncellenir.

1. CRM adayları + notlar
2. Görevler + kural motoru
3. Soğuk listeler (+ Excel/CSV içe aktarma)
4. Anketler (herkese açık `/s/[token]`)
5. Satış ve faturalar (`crm_licenses` / `crm_payments` üzerine)
6. Müşteri analizleri (yenileme, kullanım, segmentler)
7. Maliyetler (Supabase, Vercel, SMS, OpenAI, Resend)
8. Raporlar (Resend)
9. Aktivite geçmişi (`audit_logs`)
