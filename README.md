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
| İçinde | CRM personel girişi (Auth), `crm_staff`, `crm_institutions`, `crm_licenses`, `crm_payments`, `crm_leads`, `crm_notes`, `crm_tasks`, `crm_rules`, `crm_audit_logs` | Kurumlar, kullanıcılar, öğrenciler… |
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
| Kural görevi yalnız tamamlanınca saklanır, anahtarı tür + özne + vadeyle tutarlı, bir kez tamamlanır | `crm_tasks_rule_done_check`, `crm_tasks_key_check`, `crm_tasks_task_key_key` |
| Elle atanan görev geçmiş güne atanamaz; atanan kişi aktif CRM personeli | `crm_tasks_guard` tetikleyicisi |
| Tamamlama tek transaction: görev + sonuç notu + adayın statüsü / arama tarihi; geri al yalnız tamamlayan ya da ADMIN | `crm_complete_task`, `crm_reopen_task` |
| Kural günü 0–365; "Planlanan arama" parametresiz | `crm_rules_days_check`, `crm_rules_scheduled_check` |

TC ve Vergi No kontrol haneleriyle doğrulanır; algoritma SQL (`crm_is_valid_tckn/vkn`) ve TypeScript'te
(`lib/domain/institutions/rules.ts`) birebir aynıdır. Test bunu 3.000 örnekle karşılaştırır.

## Kurulum

1. `npm install`
2. `.env.local` (örnek: `.env.example`):
   - CRM projesi: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - Edoras: `EDORAS_SUPABASE_URL`, `EDORAS_SUPABASE_SERVICE_ROLE_KEY` (edoras-admin'in `.env.local`'ındaki değerler)
3. **Migration'ları CRM projesine sırayla uygulayın** (bir kez): `supabase/migrations/*.sql` (ad sırasıyla;
   `20260929160000_crm_leads.sql` adaylar ve notlar, `20260929170000_crm_tasks.sql` görevler ve takip kuralları).
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

### Görevler (zamanlayıcı yok)

- Açık kural görevleri tabloya önceden yazılmaz: `/api/crm/tasks` her istekte CRM tablolarından (adaylar, kurum
  kaydı, lisanslar, ödemeler, iç kurumlar, `crm_rules`) **sunucuda türetir** (`lib/domain/tasks/derive.ts`).
  `crm_tasks`'ta yalnız elle atanan görevler ve tamamlanan kural görevleri durur (anahtar `tür:özne:vade`).
- Tamamlarken sunucu görevi yeniden türetir; istemcinin gönderdiği anahtar bugün açık bir görev değilse 404.
- Görünürlük: kural görevleri ve atanmamış görevler ekip havuzu; atanmış görev yalnız atanan + ADMIN. ADMIN herkese,
  CRM_AGENT yalnız kendine ya da havuza atar. Kuralları yalnız ADMIN değiştirir (`/crm/rules`, Ayarlar → Kurallar).
- Kural seti (Edoras: demo ve lisans 1 yıl): Planlanan arama, Teklif +3, Demo bitişine 30 gün kala, Lisans bitişine
  60 gün kala, Süresi doldu (+0), Açık bakiye +7, Satış olmadı +90, Tarihsiz Aranacak/Takipte +0. Anket (5) ve soğuk
  liste (2) kuralları modülleri gelince görev üretir. İç kurumlar görev üretmez.

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
| Görevlerim + kural motoru (`/crm/tasks`, `/crm/rules`, Ayarlar → Kurallar): gecikmiş / bugün / yaklaşan, tamamla (sonuç + not + statü / sonraki arama, tek transaction), geri al, "Görev ata" ve "Arama listesine ekle" (aday satırı, mobil kart, detay), menü rozeti; `crm_tasks`, `crm_rules` | ✔ (en iyi arama saati, soğuk liste ve anket görevleri yok) |

## DeepSportAdmin'den sıradaki modüller

Taşındıkça `components/navigation.tsx` → `NAV_GROUPS` ve `lib/permissions.ts` → `CRM_AGENT_PATHS` güncellenir.

1. Soğuk listeler (+ Excel/CSV içe aktarma; `coldList` kuralı hazır, görev üretmeye başlar)
2. Anketler (herkese açık `/s/[token]`; `surveyNoResponse` kuralı hazır)
3. Satış ve faturalar (`crm_licenses` / `crm_payments` üzerine)
4. Müşteri analizleri (yenileme, kullanım, segmentler)
5. Maliyetler (Supabase, Vercel, SMS, OpenAI, Resend)
6. Raporlar (Resend)
7. Aktivite geçmişi (`audit_logs`)
