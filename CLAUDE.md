# EdorasCRM — ajan notları

Edoras'ın şirket içi paneli (kurum / demo / lisans / ödeme). DeepSportAdmin'den (`Desktop/DeepSportAdmin`)
kopyalanıp Supabase'e taşındı; yeni modüller oradan taşınır. Ayrıntı: `README.md`.

## En kritik kurallar

1. **İki veritabanı.** CRM verisi ve CRM girişleri EdorasCRM'in kendi projesinde (`orishbqniebbgdanazrp`,
   migration'lar `supabase/migrations/`). Edoras'ın canlı veritabanına (`bmjkpxbrmwxuildwakly`, edoras-admin
   `Desktop/YKS` + mobil `Desktop/EdorasApp`) yalnız sunucudan ve yalnız `lib/server/edoras.ts` üzerinden
   gidilir: kurum listesi, kullanım sayıları, demo açarken kurum + dönem + kurum yöneticisi. **Edoras şeması
   değiştirilmez**; şema gerçeği edoras-admin'dedir (`docs/memory/YKS/data-model.md`).
2. **İki veritabanı arasında transaction yok.** Birden fazla adımlı yazım (demo açma) her adımın geri alma
   işini `createCompensator()`'a kaydeder; hata olursa `rollback()`.
3. **Kural veritabanında da durur.** Sunucu `service_role` kullanır, RLS'i görmez. Demo, ücretli ve ödeme
   kuralları CRM projesinde CHECK kısıtları ve tetikleyicilerle zorunlu. Kural değişirse üç yeri birlikte
   güncelleyin: `lib/domain/institutions/{rules,schemas}.ts`, migration, testler.
4. **SQL değişikliği önce testte.** `supabase/tests/crm-core.test.ts` (PGlite, bellek içi Postgres) ile
   doğrulanır, sonra CRM projesine uygulanır (MCP `supabase-crm` → yalnız CRM projesi; `.mcp.json`).
5. **Veri yalnız `/api` üzerinden.** Her uç `requireStaff()` ile başlar; ADMIN işi `requireStaff({ role: "ADMIN" })`.
   CRM_AGENT'a tutar/TC/VKN/adres sunucuda boşaltılır. `service_role` anahtarları yalnız `lib/supabase/server.ts`.
6. **Hata metni istemciye gitmez.** Veritabanı hatası `lib/api/db-errors.ts` ile koda çevrilir. PostgREST
   `details` alanı satırın tamamını (TC dahil) taşıdığı için ne döndürülür ne loglanır.
7. **Yalnız Türkçe.** Metinler `messages/tr.json`'da. DeepSport'tan taşınan kodda `@/i18n/routing` →
   `@/lib/navigation` yapılır.
8. **Node 20:** supabase-js sunucuda WebSocket ister → sunucu istemcilerine `SERVER_REALTIME` (`ws`) verilir.

## Kararlar (kurucu, 2026-09-29)

- 1 dönem = 1 yıl (`TERM_YEARS`, aralık `[başlangıç, bitiş)`). Ücretli lisans 1 dönem; yenileme süren lisansın bitişinden başlar.
- Demo da 1 dönem (1 yıl) — uzatma yok. Süre dolunca kurum pasife DÜŞMEZ, yalnız "Demo bitti" görünür.
- Demo için zorunlu: yetkili ad soyad, kurum adı, telefon, e-posta.
- Ücretli hesap ve ödeme için zorunlu: adres + (TC Kimlik No veya Vergi No).
- CRM ayrı Supabase projesinde; Edoras'a da bağlanır ("ikisine de bağlan").
