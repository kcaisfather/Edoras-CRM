# Mimari

```
Tarayıcı (React Query, features/*) ──► /api/* (Next 16 route handler, app/api/**/route.ts)
                                        │ route() sarmalayıcı → requireStaff(): CRM oturum çerezi + crm_staff kaydı
                                        ├──► CRM projesi orishbqniebbgdanazrp (service_role, lib/supabase/server.ts)
                                        │      crm_* tabloları, RPC'ler, CRM personel Auth'u
                                        ├──► Edoras canlı DB bmjkpxbrmwxuildwakly (service_role)
                                        │      YALNIZ lib/server/edoras.ts (kurum listesi, demo açma)
                                        │      ve lib/server/edoras-usage.ts (salt okunur kullanım sinyali)
                                        └──► Dış: Resend (lib/server/mail.ts), Paraşüt (lib/server/parasut-client.ts)
```

## İki veritabanı

| | CRM projesi | Edoras |
| --- | --- | --- |
| Kimin | EdorasCRM'in kendi Supabase projesi | edoras-admin (`Desktop/YKS`) + mobil (`Desktop/EdorasApp`) canlı DB |
| CRM ne yapar | okur + yazar, migration buraya | okur; demo açarken kurum + yıl/dönem + yönetici yazar |
| Şema | `supabase/migrations/` | **değiştirilmez** (şema gerçeği: YKS `docs/memory/YKS/data-model.md`) |

- Bağ: `crm_institutions.institution_id` = Edoras `institutions.id` (FK yok). Edoras'ta silinen kurum CRM'de "Edoras'ta yok".
- İki DB arasında transaction yok → çok adımlı yazım `createCompensator()` (`lib/server/compensation.ts`) ile telafi edilir.

## Katmanlar

| Katman | Yer |
| --- | --- |
| Sayfa | `app/<yol>/page.tsx` (`useSearchParams` kullanan sayfa `<Suspense>` içinde) |
| Ekran | `features/<modül>/components/`, veri `features/<modül>/{api,queries,mutations}.ts` |
| Uç | `app/api/<modül>/**/route.ts` |
| Sunucu veri | `lib/server/<modül>.ts` (`import "server-only"`) |
| Saf iş kuralı | `lib/domain/<modül>/` (framework'süz, testli) |
| İçe aktarma | `lib/import/` (saf, testli) |
| Metin | `messages/tr.json` + `messages/features/<ad>.tr.json` (yalnız Türkçe) |
| Menü / yetki | `components/navigation.tsx` → `NAV_GROUPS`; `lib/permissions.ts` |

## Oturum ve yollar

- `proxy.ts` (Next 16 middleware): oturum çerezini tazeler, oturumsuz sayfayı `/login`'e yollar.
- Müşteriye açık: `/s/*`, `/api/public/*` (çereze dokunulmaz). Cron: `/api/cron/*` (Bearer `CRON_SECRET`). → [auth.md](auth.md)
- Tarayıcıdaki Supabase istemcisi yalnız giriş / çıkış / şifre içindir; veri her zaman `/api` üzerinden.
- Node 20'de supabase-js WebSocket ister → sunucu istemcilerine `ws` verilir (`lib/supabase/realtime.ts`). Elle betik
  yazarken de `realtime: { transport: ws }` ver.

## Zamanlayıcı yok

Görevler, demo bitişi, anket süresi okuma anında hesaplanır. Tek dış tetik: rapor dağıtıcısı `/api/cron/reports`
(Vercel Cron, `vercel.json`). → [modules/reports.md](modules/reports.md)
