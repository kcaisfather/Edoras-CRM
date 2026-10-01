# Yetki

## Roller (`crm_staff.role`)

| Rol | Yapar | Görmez |
| --- | --- | --- |
| `ADMIN` | her şey: ücretliye geçiş, ödeme, fatura, maliyet, aktivite, kurallar, raporlar, ekip | — |
| `CRM_AGENT` | demo açar, iletişim düzenler, aday / not / görev / soğuk liste / anket | tutar (teklif, satış, tahsilat, lisans bedeli), TC/VKN, adres |

- Tek yönetici (2026-10-01): `kamil@edorasapp.ai` (ADMIN). Yeni personel: Ayarlar → Ekip ya da `npm run staff:add`.
- Rol bilinmiyorsa en dar yetki (`panelRoleOf` → CRM_AGENT, fail-closed).

## Koruma nerede

- **Asıl koruma sunucuda:** her uç `requireStaff()`; yönetici işi `requireStaff({ role: "ADMIN" })` → CRM_AGENT 403.
- Finansal alanlar CRM_AGENT için **sunucuda boşaltılır** (yalnız arayüzde gizlemek yetmez). Arayüzde ayrıca
  `FinancialOnly` / `canSeeFinancials`.
- Menü / sayfa: `lib/permissions.ts` → `CRM_AGENT_PATHS` = `/dashboard`, `/crm`, `/institutions`, `/growth/customers`,
  `/settings`; `CRM_AGENT_DENIED_PATHS` = `/crm/rules`. Satış & Fatura, Aktivite, Maliyetler, Müşteri Analizleri yalnız ADMIN.
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
- Demo geçici şifresi yalnız açılış yanıtında bir kez gösterilir, saklanmaz.
