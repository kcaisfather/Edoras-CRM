# Yetki

## Roller (`crm_staff.role`)

| Rol | Yapar | Görmez |
| --- | --- | --- |
| `ADMIN` | her şey: ücretliye geçiş, ödeme, fatura, maliyet, aktivite, kurallar, raporlar, ekip | — |
| `CRM_AGENT` | demo açar, iletişim düzenler, aday / not / görev / soğuk liste / anket | tutar (teklif, satış, tahsilat, lisans bedeli), TC/VKN, adres |

- Yöneticiler (ADMIN, 2026-10-14): Kamil, Ceren Celbek, Eren Çolak; güncel liste `crm_staff` tablosunda. Yeni personel:
  Ayarlar → Ekip ya da `npm run staff:add` (şifre en az 8 karakter; kullanıcı varsa verilen şifreyi ÜZERİNE yazar).
- Rol bilinmiyorsa en dar yetki (`panelRoleOf` → CRM_AGENT, fail-closed).

## Koruma nerede

- **Asıl koruma sunucuda:** her uç `requireStaff()`; yönetici işi `requireStaff({ role: "ADMIN" })` → CRM_AGENT 403.
- Finansal alanlar CRM_AGENT için **sunucuda boşaltılır** (yalnız arayüzde gizlemek yetmez). Arayüzde ayrıca
  `FinancialOnly` / `canSeeFinancials`.
- Menü / sayfa: `lib/permissions.ts` → `CRM_AGENT_PATHS` = `/dashboard`, `/crm`, `/institutions`, `/growth/customers`,
  `/settings`, `/management` (Yönetim: veriyi CRM rolü değil bağlı KCA Panel hesabının yetkisi belirler →
  [modules/management-kca.md](modules/management-kca.md)); `CRM_AGENT_DENIED_PATHS` = `/crm/rules`. Satış & Fatura, Aktivite, Maliyetler, Müşteri Analizleri yalnız ADMIN.
- Yazan uçlar `assertSameOrigin(request)` ile CSRF'e karşı köken denetler.

## Oturumsuz yollar

| Yol | Yetki | Not |
| --- | --- | --- |
| `/login` | — | |
| `/s/*`, `/api/public/*` | kişiye özel anket token'ı (≥ 43 karakter) | asla 401 dönmez; oran sınırlı (`lib/server/rate-limit.ts`, bellek içi); bu listeye yol eklemek güvenlik kararıdır |
| `/api/cron/*` | `Authorization: Bearer ${CRON_SECRET}` (sabit zamanlı karşılaştırma) | secret yoksa 503 `CONFIG_MISSING` |

## Kişisel veri

- `crm_audit_logs.details`'e TC, VKN, adres, telefon, e-posta, şifre yazılmaz.
- DB hata metni istemciye / loga gitmez (`dbError`, `lib/api/db-errors.ts`); PostgREST `details` satırın tamamını taşır.
- Dış sağlayıcı hata gövdeleri (Resend, Paraşüt) saklanmaz; yalnız kısa kod (`resend:422`, `parasut:invoice:422`).
- Demo geçici şifresi yalnız açılış yanıtında bir kez gösterilir, saklanmaz. Kurum yöneticisi şifre sıfırlaması da öyle.

## Edoras hesapları (kurum yöneticisi)

- CRM, Edoras'taki kurum yöneticisinin giriş e-postasını, şifresini ve o kurumdaki aktifliğini değiştirebilir — yalnız
  ADMIN (`requireStaff({ role: "ADMIN" })`, menü de yalnız ADMIN'e çizilir). Uçlar `/api/institutions/{id}/admins/{userId}…`
  → [modules/institutions-demo.md](modules/institutions-demo.md).
- Hedef yalnız o kurumda `role 'admin'` üyeliği olan kullanıcı (yoksa 404); Edoras süper yöneticisi 403. Telefon / TC ile
  giren hesabın adresi değişmez; yeni adres `@edoras.com` / `@internal.local` olamaz (başkasının telefon / TC kimliğini
  ele geçirme riski).
- Edoras Auth hesabı tekildir: e-posta / şifre değişikliği kişinin tüm Edoras üyeliklerine işler.
- ⚠️ Edoras web paneli pasif yöneticiyi engellemiyor (yalnız mobil engelliyor) — kesin kapatma = şifre sıfırla.

## KCA Panel hesabı (Yönetim, 2026-10-14)

- CRM personeli KCA Panel e-posta + şifresiyle bir kez bağlanır (`crm_kca_links`); e-posta eşleşmesiyle otomatik bağ YOK
  (personel açabilen biri başkasının e-postasıyla hesap açıp onun kişiye özel network / toplantı notunu görmesin).
- Hatalı denemeler KCA Panel'in kilidine sayılır; KCA şifresi değişince / hesap pasifleşince bağ düşer. AI ekip bağlanamaz.
- Görünürlük: yalnız Edoras etiketli kayıtlar ∩ KCA Panel yetkisi (üyelik, toplantı sahipliği, kişiye özel network).

