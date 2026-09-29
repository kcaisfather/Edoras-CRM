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
| İçinde | CRM personel girişi (Auth), `crm_staff`, `crm_institutions`, `crm_licenses`, `crm_payments`, `crm_leads`, `crm_notes`, `crm_audit_logs` | Kurumlar, kullanıcılar, öğrenciler… |
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
| Adayın en az kurum adı ya da yetkili adı olur; telefon E.164, e-posta biçimli | `crm_leads_identity_check`, `crm_leads_contact_*_check` |
| Bir Edoras kurumuna en fazla bir aday bağlanır | `crm_leads_institution_id_key` (kısmi benzersiz dizin) |
| Kayıp nedeni yalnız "Satış olmadı"da, satış tarihi yalnız "Satış oldu"da; tutarlar ≥ 0 | `crm_leads_lost_reason_check`, `crm_leads_sold_at_check`, `crm_leads_*_amount_check` |

TC ve Vergi No kontrol haneleriyle doğrulanır; algoritma SQL (`crm_is_valid_tckn/vkn`) ve TypeScript'te
(`lib/domain/institutions/rules.ts`) birebir aynıdır. Test bunu 3.000 örnekle karşılaştırır.

## Kurulum

1. `npm install`
2. `.env.local` (örnek: `.env.example`):
   - CRM projesi: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - Edoras: `EDORAS_SUPABASE_URL`, `EDORAS_SUPABASE_SERVICE_ROLE_KEY` (edoras-admin'in `.env.local`'ındaki değerler)
3. **Migration'ları CRM projesine sırayla uygulayın** (bir kez): `supabase/migrations/*.sql` (ad sırasıyla;
   `20260929160000_crm_leads.sql` adaylar ve notlar).
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
| `scripts/` | `add-staff.mjs` (ilk yönetici; sonrası Ayarlar → Ekip) |

## Taşınan modüller

| Modül | Durum |
| --- | --- |
| Kurumlar, demo, lisans, ödeme | ✔ |
| Ayarlar: Genel, Ekip (hesap aç, rol, erişim, şifre sıfırla), Veri kalitesi (iç kurumlar), Hata kaydı, KVKK | ✔ |
| İşlem kaydı altyapısı (`crm_audit_logs`) | ✔ (ekranı Aktivite geçmişi ile gelecek) |
| CRM adayları + notlar (`/crm`): liste, aşama şeridi, özet kartlar, görünümler (bekleyen demo, satış sürecinde, bakiyesi olanlar, demo bitti, yeni kayıtlar, olası mükerrer), detay, ekle/düzenle, notlar (şikâyet, devir, program etiketi), iletişim menüsü, adaydan demo aç / kuruma bağla, tahsilat (= bağlı kurumun `crm_payments`'ı), CSV; kurum ayrıntısında "CRM adayı" kartı; Ana sayfada açık alacak | ✔ |
| Satış Analizleri (`/crm/analytics`): satış hunisi, aylık / müşteri satış kırılımları | ✔ |

## DeepSportAdmin'den sıradaki modüller

Taşındıkça `components/navigation.tsx` → `NAV_GROUPS` ve `lib/permissions.ts` → `CRM_AGENT_PATHS` güncellenir.

1. Görevler + kural motoru (adayın `next_follow_up_at` alanı hazır; aday satırında `renderAssignTask` yuvası boş)
2. Soğuk listeler (+ Excel/CSV içe aktarma)
3. Anketler (herkese açık `/s/[token]`)
4. Satış ve faturalar (`crm_licenses` / `crm_payments` üzerine)
5. Müşteri analizleri (yenileme, kullanım, segmentler)
6. Maliyetler (Supabase, Vercel, SMS, OpenAI, Resend)
7. Raporlar (Resend)
8. Aktivite geçmişi (`audit_logs`)
