# Aktivite geçmişi ve Maliyetler (yalnız ADMIN)

## Aktivite geçmişi (`/activity-history`, menü "Aktivite")

Uçlar `/api/activity/*`, sunucu `lib/server/activity.ts`, migration yok. İki kapsam:
- **Kurum etkinliği:** Edoras'tan salt okunur birleşik zaman çizelgesi (yoklama, ödev, deneme oluşturma / sonuç yayını,
  konu işleme, duyuru, elle SMS). Süzgeç: kurum + olay türü + tarih (en çok 90 gün, varsayılan 7), en yeni 1000 olay.
  Satırda yalnız zaman, kurum, tür, sayı, kişinin rolü (ad / öğrenci verisi yok). İç kurumlar kurum seçilmeden listelenmez.
- **CRM işlem kaydı:** `crm_audit_logs` (kişi, eylem, kayıt türü, tarih; `details` düz metin çipleri).

## Maliyetler (`/costs`, menü "Operasyon")

Uçlar `/api/costs/*`, sunucu `lib/server/costs.ts`, DB `crm_cost_entries`, `crm_cost_budgets`, `crm_cost_settings`.
- Sekmeler: Genel bakış (bu ay, ay sonu tahmini, geçen ay, hizmet payı, 12 ay eğilim, uyarılar, Edoras'a göre tahmini SMS),
  Hizmetler (hizmet × 12 ay, SMS birim fiyatı), Kayıtlar (elle + CSV/Excel içe aktarma), Kurumlar (ortak maliyet aktif
  öğrenciyle paylaştırılır + kurumun SMS'i, lisans gelirine göre marj), Bütçeler (CRUD), Uyarılar (okuma anında: yumuşak /
  sert eşik, aşım tahmini, aylık sıçrama), Dışa aktar (CSV).
- Maliyet verisi **elle girilir** (AWS CE/CUR bağlantısı yok). DeepSport'taki Microservices / Query / Reconcile sekmeleri yok.
