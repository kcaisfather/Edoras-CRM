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
| İçinde | CRM personel girişi (Auth), `crm_staff`, `crm_institutions`, `crm_licenses`, `crm_payments`, `crm_leads`, `crm_notes`, `crm_tasks`, `crm_rules`, `crm_prospect_lists`, `crm_prospects`, `crm_surveys`, `crm_survey_invitations`, `crm_survey_responses`, `crm_invoices`, `crm_audit_logs` | Kurumlar, kullanıcılar, öğrenciler… |
| CRM ne yapar | Okur ve yazar (migration bu projeye) | Kurum listesi ve kullanım sayılarını okur; demo açarken kurum + aktif dönem + kurum yöneticisi oluşturur |
| Şema değişikliği | `supabase/migrations/` | **Yok.** Edoras şemasına dokunulmaz |

- Edoras'a dokunan kodun tamamı `lib/server/edoras.ts` (kurumlar, demo açma) ve `lib/server/edoras-usage.ts` (salt okunur kullanım sinyalleri) içinde.
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
| Aynı bilgiler olmadan fatura da kaydedilemez; faturanın satış referansı (ödeme / lisans) o kuruma ait olmalı; kayıttan sonra kurum, satış ve tutar alanları değişmez | `crm_guard_invoice` tetikleyicisi (`CRM_BILLING_REQUIRED`, `CRM_INVOICE_SALE_MISMATCH`, `CRM_INVOICE_IMMUTABLE`) |
| Fatura profili: `billing_type` doluysa unvan + il + ilçe + fatura e-postası + adres tam; TC ⇔ bireysel, Vergi No ⇔ kurumsal (+ vergi dairesi); vergi dairesi yalnız Vergi No ile; posta kodu 5 hane. Eski satırlar (tür boş) geçerli kalır | `crm_institutions_billing_profile_check`, `_tax_office_vkn_check`, `_billing_type_check`, `_billing_text_check`, `_postal_code_check`, `_billing_email_check` |
| Fatura: ödeme ya da lisans referansı; tutar > 0; KDV oranı 0–100; net + KDV = toplam (±0,01); PROVIDER ⇔ sağlayıcı; e-posta talebinde 1–5 alıcı; ISSUED numara + an ister, SENT yalnız e-posta, FAILED hata kodu ister, elle kayıt daima numaralı ve kesilmiş; Idempotency-Key benzersiz | `crm_invoices_*_check`, `crm_invoices_idempotency_key_key` |
| Adayın en az kurum adı ya da yetkili adı olur; telefon E.164, e-posta biçimli | `crm_leads_identity_check`, `crm_leads_contact_*_check` |
| Bir Edoras kurumuna en fazla bir aday bağlanır | `crm_leads_institution_id_key` (kısmi benzersiz dizin) |
| Kayıp nedeni yalnız "Satış olmadı"da, satış tarihi yalnız "Satış oldu"da; tutarlar ≥ 0 | `crm_leads_lost_reason_check`, `crm_leads_sold_at_check`, `crm_leads_*_amount_check` |
| Kural görevi yalnız tamamlanınca saklanır, anahtarı tür + özne + vadeyle tutarlı, bir kez tamamlanır | `crm_tasks_rule_done_check`, `crm_tasks_key_check`, `crm_tasks_task_key_key` |
| Elle atanan görev geçmiş güne atanamaz; atanan kişi aktif CRM personeli | `crm_tasks_guard` tetikleyicisi |
| Tamamlama tek transaction: görev + sonuç notu + adayın statüsü / arama tarihi; geri al yalnız tamamlayan ya da ADMIN | `crm_complete_task`, `crm_reopen_task` |
| Kural günü 0–365; "Planlanan arama" parametresiz | `crm_rules_days_check`, `crm_rules_scheduled_check` |
| Soğuk liste kişisinin en az adı, kurumu, telefonu ya da e-postası olur; telefon E.164 (ham değerle), e-posta biçimli ve küçük harf | `crm_prospects_identity_check`, `crm_prospects_phone_check`, `crm_prospects_email_check` |
| Aynı listede aynı telefon / e-posta bir kez; liste adı 1–120; alan uzunlukları aday sınırlarının altında | `crm_prospects_list_phone_key`, `crm_prospects_list_email_key`, `crm_prospect_lists_name_check`, `crm_prospects_length_check` |
| Sonuç anı ancak ve ancak aranmış kişide; CRM bağı taşınma anı olmadan olmaz (tek yönlü: aday silinince bağ boşalır, taşınma anı kalır) | `crm_prospects_outcome_at_check`, `crm_prospects_moved_check` |
| "Sıcağa taşı" tek transaction: aday (COLD_LIST) + not + taşındı işareti; adayı duran kişi ikinci kez taşınamaz | `crm_convert_prospect` (`CRM_PROSPECT_ALREADY_MOVED`) |
| Toplu eklemede istek başına en çok 2000 satır; eşzamanlı eklemede liste içi mükerrer atlanır | `crm_add_prospects` |
| Anket soruları dizi, her soru `{ id, type: NPS\|CSAT\|COMMENT, text?, required }`, her tür bir kez; en çok bir varsayılan anket; link 1–365 gün | `crm_surveys_questions_check`, `crm_surveys_default_key`, `crm_surveys_link_valid_days_check` |
| Davet token'ı ≥ 43 karakter base64url ve benzersiz (sunucuda 32 bayt rastgele); e-posta kanalında e-posta, WhatsApp / SMS'te telefon (E.164) | `crm_survey_invitations_token_check` / `_token_key`, `_contact_check`, `_phone_check`, `_email_check` |
| Davet durumu ↔ anları tutarlı; davet açılırken aday ya da kurum zorunlu; token ve anket değişmez; RESPONDED geri dönmez | `crm_survey_invitations_state_check`, `crm_survey_invitations_guard` |
| Aynı alıcıya 7 gün içinde yanıtsız, süresi dolmamış davet varsa yenisi açılmaz (alıcı başına kilit) | `crm_create_survey_invitation` |
| Davet başına bir yanıt; NPS 0–10, memnuniyet 1–5, yorum ≤ 2000; zorunlu sorular; süresi dolmuş link yanıt almaz (tek transaction) | `crm_survey_responses_invitation_key`, `crm_survey_submit` (`CRM_SURVEY_EXPIRED` / `_ANSWERED` / `_ANSWER_INVALID`) |

TC ve Vergi No kontrol haneleriyle doğrulanır; algoritma SQL (`crm_is_valid_tckn/vkn`) ve TypeScript'te
(`lib/domain/institutions/rules.ts`) birebir aynıdır. Test bunu 3.000 örnekle karşılaştırır.

## Kurulum

1. `npm install`
2. `.env.local` (örnek: `.env.example`):
   - CRM projesi: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - Edoras: `EDORAS_SUPABASE_URL`, `EDORAS_SUPABASE_SERVICE_ROLE_KEY` (edoras-admin'in `.env.local`'ındaki değerler)
   - Anketler: `NEXT_PUBLIC_APP_URL` (anket linklerinin kökü, ör. `https://crm.edorasapp.ai`; boşsa isteğin / tarayıcının
     adresi — üretimde tanımlayın). İsteğe bağlı e-posta: `RESEND_API_KEY` + `EMAIL_FROM` (ikisi de doluysa "E-posta"
     kanalı açılır; yoksa kanal kapalı, WhatsApp / SMS / Link sağlayıcısız çalışır)
   - Faturalar: isteğe bağlı `ACCOUNTANT_EMAIL` (fatura talebinin gideceği muhasebeci adresi; `RESEND_API_KEY` +
     `EMAIL_FROM` ile birlikte doluysa "E-posta ile talep" açılır, yoksa 503 `MAIL_NOT_CONFIGURED` ve ekran "Elle kayıt"ı
     önerir). İsteğe bağlı `PARASUT_CLIENT_ID`, `PARASUT_CLIENT_SECRET`, `PARASUT_USERNAME`, `PARASUT_PASSWORD`,
     `PARASUT_COMPANY_ID` (hepsi doluysa sağlayıcı "yapılandırıldı" görünür; gerçek Paraşüt istemcisi henüz yazılmadı)
3. **Migration'ları CRM projesine sırayla uygulayın** (bir kez): `supabase/migrations/*.sql` (ad sırasıyla;
   `20260929160000_crm_leads.sql` adaylar ve notlar, `20260929170000_crm_tasks.sql` görevler ve takip kuralları,
   `20260929180000_crm_prospects.sql` soğuk listeler ve kişileri, `20260929190000_crm_surveys.sql` anketler, davetler
   ve yanıtlar, `20260929200000_crm_invoices.sql` fatura profili sütunları ve faturalar).
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
                              └──► Edoras (service_role, lib/server/edoras*.ts): kurumlar, demo açma, kullanım (salt okunur)
```

- `proxy.ts` oturum çerezini tazeler, oturumsuz isteği `/login`'e yollar. Müşteriye açık anket yolları (`/s/*`,
  `/api/public/*`; `lib/permissions.ts` → `CUSTOMER_PUBLIC_PATHS`) bunun dışındadır: çerez okunmaz / tazelenmez,
  yönlendirme yok, panel kabuğu çizilmez.
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
  60 gün kala, Süresi doldu (+0), Açık bakiye +7, Satış olmadı +90, Tarihsiz Aranacak/Takipte +0, Soğuk liste (aranmamış
  kişi bugün, ulaşılamayan son denemeden +2), Anket araması (gönderilmiş / açılmış, yanıtsız ve süresi dolmamış davet →
  gönderimden +5; aday başına en son davet). İç kurumlar görev üretmez.
- Anket araması adaya bağlıdır (`crm_tasks_subject_check` kurumu yalnız kurum kurallarına açar; şema değiştirilmedi):
  kurumdan açılan davet kurumun bağlı adayına düşer, adayı olmayan kurumun daveti görev üretmez. Görevde "Anketi
  WhatsApp ile tekrar gönder" düğmesi çıkar.
- Soğuk liste görevleri kişilerden türetilir (`lib/domain/tasks/cold.ts`), `crm_tasks`'a hiç yazılmaz: görevi kapatmak =
  kişinin arama sonucunu girmek (`PATCH /api/crm/prospects/{id}`; Görüşüldü / İlgilenmiyor → düşer, Ulaşılamadı → N gün
  sonra yeniden). CRM'de adayı ya da kurum kaydı olan, telefonu olmayan ve taşınmış kişiler görev olmaz. Aynı anda en çok
  50 aranmamış kişi görev olur (eski liste, dosya sırası önce); menü rozeti soğuk liste görevlerini saymaz.

### Soğuk listeler ve içe aktarma

- Listeler ekipçe paylaşılır (DeepSport'ta tarayıcıdaydı). Her CRM kullanıcısı liste açar, içe aktarır, sonuç girer,
  kişi siler ve "Sıcağa taşı" yapar; **listeyi yalnız ADMIN siler** (kişileriyle birlikte).
- Excel (`read-excel-file`, yalnız ilk sayfa) ve CSV (UTF-8 / Windows-1254) tarayıcıda okunur; dosya sunucuya yüklenmez.
  Sütun eşleme, önizleme ve mükerrer önizlemesi tarayıcıda; eşlenen ham alanlar 500'erli parçalar hâlinde gider.
- Sunucu istemciye güvenmez: telefonu adaylarla aynı TR normalleştiricisinden, e-postayı veritabanı kuralıyla yeniden
  hesaplar; mükerreri (aynı istek, aynı liste, CRM adayı, kurum yetkilisi) hiçbir koşulda eklemez ve `skipped`'te nedeniyle
  döner. İstek başına en çok 2000 satır ve 2 MB. CRM adayı içe aktarmada onaydan önce `dryRun` ile sunucu raporu alınır.

### Anketler (herkese açık `/s/[token]`)

- Puanı **yalnız müşteri** verir (NPS 0–10, memnuniyet 1–5, yorum); panelde puan giriş alanı ve yazma ucu yoktur.
  Panel uçları (`/api/crm/surveys/*`) her CRM kullanıcısına açık (DeepSport'ta da ADMIN ve CRM_AGENT).
- Davet alıcısı CRM adayı ve / veya kurumdur; sunucu ad / e-posta / telefonu aday ya da kurum kaydından kendisi okur
  (istemcinin yazdığı adrese anket gitmez). Token sunucuda `crypto.randomBytes(32)` → base64url. Aynı alıcıya 7 gün
  içinde yanıtsız davet varsa yenisi açılmaz, o döner (`reused`; e-posta tekrar gitmez).
- Kanallar: **E-posta** sunucudan Resend REST API'siyle (`lib/server/mail.ts`, SDK yok; `RESEND_API_KEY` + `EMAIL_FROM`
  yoksa kanal kapalı, uç 503 `MAIL_NOT_CONFIGURED`; gönderilemezse davet FAILED + 502). **WhatsApp / SMS / Link**
  sağlayıcısız: sunucu linki üretir (CREATED), personel wa.me / sms: / kopyala ile kendisi gönderir ve "Gönderdim" der
  (`POST /api/crm/surveys/invitations/{id}/sent` → SENT). E-posta yeniden gönderme yalnız EMAIL davetinde.
- Zamanlayıcı yok: süre dolumu okurken hesaplanır (ekranda EXPIRED; link ilk açılışta tembelce EXPIRED yazılır).
- Herkese açık uçlar `GET /api/public/surveys/{token}` (davet OPENED olur) ve `POST …/responses` oturumsuzdur, **asla 401
  dönmez** (geçersiz 404, süresi dolmuş 410, yanıtlanmış 409, oran sınırı 429); service_role yalnız sunucuda ve yalnız
  `crm_survey_open` / `crm_survey_submit` için. Yanıt yalnız anket başlığı, giriş metni, sorular ve alıcının ilk adını
  taşır; gövde ≤ 16 KB. Oran sınırı `lib/server/rate-limit.ts`: IP + token başına kayan pencere (okuma 30 / 10 dk, yazma
  10 / 10 dk) + IP başına 120 / 10 dk — **bellek içi, tek Node süreci için**; çok örnekli / sunucusuz dağıtımda paylaşılan
  depo (Redis / Postgres) gerekir.
- Memnuniyet rozeti (Adaylar tablosu, mobil kart, aday detayı; kurum ayrıntısında "Memnuniyet anketi" kartı) son yanıttan;
  liste rozetleri tek istekle (`GET /api/crm/surveys/satisfaction`). Eleştirmen yanıtında otomatik ticket / görev yok
  (DeepSport ile aynı): şikâyet kaydı adayın notlarından elle (`SIKAYET`).

### Satış ve faturalar (yalnız ADMIN)

- **Ödeme Geçmişi** (`/payment-history`, DeepSport `/log-products` karşılığı): tüm kurumların `crm_payments`'ı — kurum adı
  arama, yöntem, tarih aralığı, sayfalama; süzgece uyan TÜM kayıtların toplamı; ödemenin faturası varsa durum rozeti;
  üstte açık alacak kartı. Satış = 1 yıllık lisans (`crm_licenses`), tahsilat = `crm_payments`; kanal / ürün kataloğu yok,
  "satıcı" kaydı açan personeldir (`created_by` → `crm_staff.full_name`).
- **Faturalar** (`/sales/invoices`): durum sekmeleri (sayaçlı), fatura tarihi aralığı, sayfalama, CSV, başarısız faturayı
  yeniden dene. "Satış & Fatura" menü grubu yalnız ADMIN'e görünür; iki yol da `CRM_AGENT_PATHS`'te yok, uçlar CRM_AGENT'a 403.
- **Fatura kes** (`InvoiceDialog`): kurum ayrıntısında her ödeme satırında (fatura durumu rozeti + düğme) ve CRM adayı
  satırında / detayında (ücretli kuruma bağlıysa; satış — ödeme ya da lisans — pencerede seçilir). İki adımlı onay, KDV
  (varsayılan %20, dahil / hariç), aynı satışta ikinci fatura için uyarı + onay (sert engel değil).
  - **E-posta ile talep**: talep Resend ile `ACCOUNTANT_EMAIL` adresine (istenirse müşterinin fatura e-postasına da) gider;
    muhasebeci keser. Gönderilirse `SENT`, olmazsa `FAILED` + kısa hata kodu (`resend:422`…). Resend ya da adres yoksa
    satır açılmaz, 503 `MAIL_NOT_CONFIGURED`.
  - **Elle kayıt**: faturayı başka yerde kestiniz; numara + tarih kaydedilir, `ISSUED`.
  - **Platforma aktar (Paraşüt)**: `lib/server/invoices.ts` → `InvoiceProvider` arayüzü hazır, istemci yazılmadı
    (kimlik bilgisi yok; TODO orada). `GET /api/sales/invoices/providers` PARASUT için `configured: false` döner
    (`PARASUT_*` ortam değişkenleri tümüyle doluysa `true`, ama çağrı `parasut:not-implemented` ile FAILED olur).
  - Yeniden deneme yalnız `FAILED` (`POST /api/sales/invoices/{id}/retry`; koşullu güncelleme: iki eşzamanlı istekten biri
    gönderir). Aynı `Idempotency-Key` (başlık ya da gövde) yeni satır açmaz, var olanı döndürür (200; yeni fatura 201).
    DeepSport'ta iptal ucu yok → `CANCELLED` durumu şemada var, uç yok.
  - Fatura ancak fatura bilgisi (adres + TC/VKN) tam kuruma açılır (veritabanı zorlar). E-posta ve platform yöntemleri ayrıca
    **tam fatura profili** ister (unvan, il, ilçe, fatura e-postası, kurumsalda vergi dairesi); elle kayıt istemez.
- **Fatura profili** `crm_institutions`'ta (ayrı tablo yok): kurum ayrıntısı → "Fatura bilgileri" (`GET / PUT
  /api/institutions/{id}/billing`; PATCH eski adı). Tür (bireysel = TC, kurumsal = Vergi No) kimlikten türetilir. Ücretliye
  geçiş ve kayda alma formları yalnız adres + kimlik ister (profil sonradan tamamlanır); ücretliye geçişte tür boşalır.
- Uçlar: `GET /api/sales/payments`, `GET|POST /api/sales/invoices`, `POST /api/sales/invoices/{id}/retry`,
  `GET /api/sales/invoices/providers|options`. İşlem kaydı: `INVOICE_CREATED / _ISSUED / _FAILED / _RETRIED`, `BILLING_UPDATED`
  (tutar, yöntem, durum, satış referansı; e-posta, adres, TC/VKN, unvan yazılmaz).

### Müşteri analizleri (Edoras kullanım sinyalleri)

DeepSport'taki "Müşteriler" ve "Müşteri Analizleri" kurum düzeyinde taşındı. **Migration yok** — kalıcı yeni durum tutulmaz;
her şey Edoras'tan (salt okunur) ve mevcut `crm_*` tablolarından türetilir. Edoras okuması `lib/server/edoras-usage.ts`'te
(`edoras.ts` ile Edoras'a dokunan iki dosyadan biri).

- **Kullanım = etkinlik.** Edoras'ta "son giriş" alanı yok; kurumun etkinliği: `attendance_sessions.date` (yoklama, en iyi günlük
  sinyal), `lesson_topic_logs.date` (konu işleme), `assignments.created_at` (ödev), `exams.created_at` (deneme),
  `announcements.created_at` (duyuru), `sms_logs.created_at` (yalnız elle; `send_type = 'auto'` hariç). **Kullanılmayanlar:**
  `exam_results.created_at` (yeniden puanlamada değişir), `student_assignments` (öğrenci teslimi; `institution_id` yok),
  `user_notifications.read_at` (2026-09-10 öncesi güvenilmez), `user_devices.last_seen_at` (yalnız push izinli cihaz),
  `auth.users.last_sign_in_at` (yalnız açık girişte değişir). Tarihler Europe/Istanbul gününe çevrilir.
- **Tanımlar** (`lib/domain/growth/usage.ts`): Kullanıyor = son 14 günde etkinlik; hazır süzgeçler 14+ / 30+ gün etkinlik yok;
  "Hiç aktive olmamış" = hiç etkinlik yok + kurum 30 günden eski (DeepSport dummy hesap temizliğinin karşılığı, **silme eylemi yok**);
  "Öğrenci eklememiş" (`students` sayısı 0) ve "Öğretmeni yok"; "90+ gün girmeyen ödeyenler" = lisansı süren ama 90+ gündür etkinliği
  olmayan (tutar gösterilmez). Sayı penceresi 7 / 30 / 90 gün (sunucu ≤ 180 gün ile sınırlar).
- **Sorgu maliyeti:** kurum başına ≈ 18 istek (`head:true` sayımlar ve `limit ≤ 1000` seçimler; tam tablo taraması yok); toplam
  eşzamanlı istek 10 ile sınırlı (`lib/utils/limiter.ts`); sonuç kurum + pencere anahtarıyla **5 dakika bellekte** tutulur, eşzamanlı
  istekler tek çalışmada birleşir. Okunamayan kaynak (izin / zaman aşımı) `unavailable` olarak işaretlenir, sayfayı düşürmez.
  Haftalık büyüme tablosu ağırdır (kaynak başına ≤ 2 sayfa); yalnız bölüm açılınca çekilir.
- **Uçlar** (hepsi `requireStaff`): `GET /api/growth/customers?window=` (kurum + lisans + kullanım; lisans bedeli ve ödemeler yalnız
  ADMIN'e, CRM_AGENT için sunucuda boşaltılır — yalnız "bedelsiz mi" bilgisi kalır), `GET /api/growth/weekly?weeks=`,
  `GET /api/growth/institutions/{id}/usage`.
- **Ekranlar:** `/growth/customers` (Müşteri Takibi: Hepsi, Kullanıyor, Kullanmıyor, Süresi Dolacaklar, Sadık, hazır süzgeçler,
  segmentler; Kampanya) — CRM_AGENT'a açık; `/growth/analytics` (Müşteri Analizleri: kartlar, Kullanım, Gelir sızıntısı,
  Retention & Churn, Birim ekonomisi) — yalnız ADMIN yolu. Kurum ayrıntısında "Kullanım" kartı.
- **Yenileme / retention** ücretli `crm_licenses` satırlarından KESİN hesaplanır (DeepSport'ta ödeme + ürün süresinden tahmindi):
  her ücretli lisans bir paket; bitişten sonra 30 gün içinde yeni lisans başlarsa yenilendi, yoksa churn. Kohort ilk lisans ayına göredir.
- **DeepSport'tan bırakılanlar:** Genişleme (kontenjan / koltuk kavramı Edoras'ta yok), "Açık şikâyet" ön ayarı (CRM notu kurum düzeyinde
  değil), giriş logu / "Hiç giriş yapmamış" (yerine etkinlik), kanal sekmeleri (tek ürün), AWS maliyeti / kur / CAC-ROAS (veri yok),
  kampanyada e-posta kanalı (onay / çıkış kaydı yok; WhatsApp bağlantıları ve CSV var), `/analytics` telemetri (Edoras'ta telemetri yok).

## Klasörler

| Yol | İçerik |
| --- | --- |
| `app/` | Sayfalar ve `/api` uçları |
| `features/<ad>/` | Ekran bileşenleri, sorgular (`queries.ts`), yazımlar (`mutations.ts`); dışarıya `index.ts` |
| `lib/domain/` | Saf iş kuralları (framework'süz, testli) |
| `lib/import/` | İçe aktarma: dosya okuma, sütun eşleme, normalleştirme, mükerrer önizlemesi ve sunucu ayıklaması (saf, testli) |
| `lib/server/` | Sunucu veri erişimi (`server-only`); Edoras erişimi yalnız `edoras.ts` ve `edoras-usage.ts` |
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
| Görevlerim + kural motoru (`/crm/tasks`, `/crm/rules`, Ayarlar → Kurallar): gecikmiş / bugün / yaklaşan, tamamla (sonuç + not + statü / sonraki arama, tek transaction), geri al, "Görev ata" ve "Arama listesine ekle" (aday satırı, mobil kart, detay), menü rozeti; `crm_tasks`, `crm_rules` | ✔ (en iyi arama saati yok) |
| Soğuk listeler + Excel/CSV içe aktarma (`/crm/cold-lists`, Adaylar → "İçe aktar"): liste seçici, sonuç süzgeci ve toplu sonuç kaydı, "Sıcağa taşı" (aday + not tek transaction), CSV, şablon; içe aktarma (sütun eşleme, önizleme, mükerrer çözümü, sunucu doğrulaması ve atlanan satırların nedenleri); Görevlerim'de "Soğuk liste araması" (kaynak süzgeci, sonuç gir); KVKK envanteri; `crm_prospect_lists`, `crm_prospects` | ✔ (Arama Kuyruğu / Süresi Dolacaklar / müşteri sekmelerindeki içe aktarma yok — ekranlar yok) |
| Satış ve faturalar (`/payment-history`, `/sales/invoices`, yalnız ADMIN): Ödeme Geçmişi (tüm kurumların ödemeleri, süzgeç, sayfalama, toplam, fatura rozeti), Faturalar (durum sekmeleri, tarih, sayfalama, CSV, yeniden dene), "Fatura kes" (kurum ödeme satırı, aday satırı / detayı; e-posta talebi Resend + `ACCOUNTANT_EMAIL`, elle kayıt, Paraşüt arayüzü hazır — istemci yok), genişletilmiş fatura profili (`crm_institutions` sütunları, "Fatura bilgileri" formu), KVKK envanteri; `crm_invoices` | ✔ (Paraşüt entegrasyonu yok; e-Fatura mükellef sorgusu yok; iptal ucu DeepSport'ta da yok) |
| Anketler (`/crm/surveys`, herkese açık `/s/[token]`): özet (NPS, dağılım, yanıt oranı, memnuniyet ort.), gönderimler (süzgeç, CSV, kopyala / WhatsApp hatırlatması / "Gönderdim" / e-postayı yeniden gönder), yanıtlar (süzgeç, CSV), anket tanımı ve önizleme; "Anket gönder" (Adaylar satırı, mobil kart, aday detayı; sayfadan toplu: adaylar + adayı olmayan kurumlar); memnuniyet rozeti (tablo, mobil kart, detay) ve kurum ayrıntısında memnuniyet kartı; Görevlerim'de "Anket araması" (`surveyNoResponse`) + WhatsApp hatırlatması; e-posta Resend ile (isteğe bağlı); KVKK envanteri; `crm_surveys`, `crm_survey_invitations`, `crm_survey_responses` | ✔ (eleştirmen ticket'ı yok — DeepSport'ta da yok) |
| Müşteri analizleri (`/growth/customers`, `/growth/analytics`): Müşteri Takibi (Hepsi / Kullanıyor / Kullanmıyor, Süresi Dolacaklar kovaları, Sadık top 50 + Kampanya (WhatsApp bağlantıları, CSV), hazır süzgeçler, segmentler; kurum türü süzgeci, arama, sıralama, CSV), Müşteri Analizleri (kartlar, kullanım dağılımı ve kaynak bazında etkinlik, haftalık büyüme, gelir sızıntısı, retention & churn + kohort, birim ekonomisi — ADMIN); kurum ayrıntısında "Kullanım" kartı; Edoras'tan salt okunur etkinlik sinyalleri, migration yok | ✔ (Genişleme, kanal, AWS maliyeti / CAC, e-posta kampanyası, telemetri yok — nedenleri yukarıda) |

## DeepSportAdmin'den sıradaki modüller

Taşındıkça `components/navigation.tsx` → `NAV_GROUPS` ve `lib/permissions.ts` → `CRM_AGENT_PATHS` güncellenir.

1. Maliyetler (Supabase, Vercel, SMS, OpenAI, Resend)
2. Raporlar (Resend — `lib/server/mail.ts` hazır)
3. Aktivite geçmişi (`audit_logs`)
4. Paraşüt istemcisi (Satış ve faturalar → "Platforma aktar"; `InvoiceProvider` arayüzü hazır)
