# Satış ve faturalar (yalnız ADMIN)

Ekran: `/payment-history`, `/sales/invoices`; "Fatura kes" kurum ödeme satırından, aday satırı / detayından. Uçlar:
`/api/sales/payments`, `/api/sales/invoices` (GET liste, POST oluştur — `Idempotency-Key` zorunlu), `/{id}/retry`,
`/{id}/pdf`, `/options`, `/providers`. Sunucu: `lib/server/invoices.ts`, `sales-payments.ts`, Paraşüt
`lib/server/parasut-client.ts`. DB: `crm_invoices` (+ `provider_ref`, `provider_job`).

## Yöntemler

| Yöntem | Ne olur | Gerekir |
| --- | --- | --- |
| `EMAIL` | talep Resend ile `ACCOUNTANT_EMAIL`'e (istenirse müşteriye kopya); muhasebeci keser → `SENT` | `RESEND_API_KEY` + `EMAIL_FROM` + `ACCOUNTANT_EMAIL`, tam fatura profili |
| `MANUAL` | başka yerde kesildi; numara + tarih → `ISSUED` | adres + TC/VKN |
| `PROVIDER` (Paraşüt) | Paraşüt'te kesilir + e-Fatura / e-Arşiv → `ISSUED`, GİB numarası | `PARASUT_*` (5 zorunlu + isteğe bağlı ürün), tam fatura profili |

## Paraşüt akışı (2026-10-01 yazıldı; canlı hesapla DENENMEDİ)

1. OAuth2 password grant (`/oauth/token`, `redirect_uri=urn:ietf:wg:oauth:2.0:oob`), jeton 2 saat, süreç içinde önbellek,
   401'de bir kez yenile, 429'da `Retry-After` kadar bekle.
2. Müşteri: `/contacts?filter[tax_number]=` → yoksa oluştur (company / person, vergi dairesi, adres, il, ilçe, e-posta).
3. Ürün: `PARASUT_PRODUCT_ID` ya da `EDORAS-LISANS` kodlu hizmet → yoksa oluştur (Paraşüt fatura kalemi ürün ister).
4. `/sales_invoices` (1 kalem, `unit_price` = net, `vat_rate`, `currency: TRL`) → id **hemen** `provider_ref`'e yazılır.
5. `/e_invoice_inboxes?filter[vkn]=` → kutu varsa `/e_invoices` (scenario `basic`, `to` = kutu adresi), yoksa `/e_archives`.
   Yanıt = trackable job → `provider_job`.
6. İş ~25 sn sorulur (10 × 2,5 sn). `done` → `/sales_invoices/{id}?include=active_e_document` → numara (`invoice_number`)
   + tür. `error` → `FAILED parasut:formalize:error`, job boşalır. Süre yetmezse `FAILED parasut:pending`.
7. **Yeniden dene** (`retry`): `provider_ref` varsa yeni satış faturası AÇILMAZ; job varsa aynı işi sorar, yoksa önce
   belge resmileşmiş mi bakar, değilse yalnız resmileştirmeyi yineler. `provider_ref` DB tetikleyicisiyle değiştirilemez.
8. PDF saklanmaz (Paraşüt adresi 1 saat geçerli): DTO'da `pdfUrl = /api/sales/invoices/{id}/pdf` → uç taze adrese 302
   (hazır değilse 409 `INVOICE_PDF_NOT_READY`, Paraşüt'e ulaşılamazsa 502 `PROVIDER_ERROR`).

Hata kodları: `parasut:<adım>:<http>` (adım: auth, contact, product, invoice, inbox, formalize, job, document, pdf).
Testler: `lib/server/parasut-client.test.ts` (sahte sunucu, 13 senaryo), `supabase/tests/crm-invoice-provider-refs.test.ts`.

**İlk canlı kullanımda:** küçük tutarlı bir test faturası kes → Paraşüt panelinde müşteri, hizmet ve belge doğru mu bak;
şirketin e-Fatura/e-Arşiv aktivasyon tarihinden önceki düzenleme tarihi reddedilir. Gerekirse KDV muafiyet kodu
(%0 KDV) desteklenmiyor — eklenecekse `EArchiveFormAttributes.vat_exemption_reason_code`.

## Diğer

- Aynı satışa ikinci fatura: uyarı + onay (sert engel değil). Fatura iptali yok (DeepSport'ta da yok; `CANCELLED` şemada).
- Kayıttan sonra kurum / satış / tutar değişmez (`crm_guard_invoice`).
- Ödeme Geçmişi: tüm kurumların `crm_payments`'ı, süzgece uyan tüm kayıtların toplamı, fatura rozeti, açık alacak kartı.
