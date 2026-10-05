# CRM adayları, notlar, Satış Analizleri

Ekran: `/crm` (Adaylar), `/crm/analytics`. Uçlar: `/api/crm/leads/**`. Sunucu: `lib/server/crm-leads.ts`, `crm-notes.ts`.
DB: `crm_leads`, `crm_notes` (migration `crm_leads`).

- Liste: aşama şeridi, özet kartlar, görünümler (bekleyen demo, satış sürecinde, bakiyesi olanlar, demo bitti, yeni kayıtlar,
  olası mükerrer), kaynak süzgeci (`?source=`; "Tümü" menüsünde Görünümler / Durumlar / Kaynaklar tek seçim), ekle, CSV, toplu işlem (`/api/crm/leads/bulk`).
- Satır arayüzü: **StatusDropdown** (satır içi statü; `lib/domain/crm/status-change.ts` + `features/crm/useLeadStatusUpdate.ts`, aynı PATCH ucu — Teklif verildi: sonraki arama + tutar, Satış olmadı: kayıp nedeni ZORUNLU (satır içi pencerede; formda hâlâ "Belirtilmedi" olabilir) + sonraki arama, Satış oldu: tutar + devir notu; basit statülerde ~5 sn "Geri al"; kayıp ayrıntısı, satış tarihi, offer_by/sold_by sunucuda), tek **İşlemler** menüsü (`CrmRowActionsMenu`: Düzenle, Not, Görev ata, Arama listesine ekle, Tahsilat, Fatura kes, Anket gönder, İletişim, Demo aç / Kuruma bağla, Şikâyet), **aday paneli** (`CrmLeadSheet`, sağdan, doğrudan düzenleme: satıra tıklama ya da "Düzenle" → `?lead=`; ayrı düzenleme penceresi yok; form `crm-edit/*`, salt okunur bölümler `lead-sheet/*`; kaydedilmemiş değişiklikle kapatınca onay).
- Notlar: şikâyet (`SIKAYET`), devir, program etiketi.
- Adaydan **demo aç** (`/api/crm/leads/{id}/demo` → aynı demo akışı, [institutions-demo.md](institutions-demo.md)) ya da
  var olan Edoras kurumuna **bağla** (`/link`; bir kuruma en fazla bir aday — kısmi benzersiz dizin).
- Tahsilat = bağlı kurumun `crm_payments`'ı (`/collections`); kurum ayrıntısında "CRM adayı" kartı; Ana sayfada açık alacak.
- Kurallar: en az kurum adı ya da yetkili adı; telefon E.164; kayıp nedeni (12'li ortak küme: PRICE, BUDGET_NOT_APPROVED,
  NOT_USED, SEASON_ENDED, TEAM_DISBANDED, COACH_LEFT_CLUB, COMPETITOR, MISSING_FEATURE_TECH, DISSATISFIED,
  NOT_DECISION_MAKER, UNREACHABLE, OTHER) ve kayıp ayrıntısı (`lost_note`, `competitor` yalnız COMPETITOR'da,
  `recall_at`) yalnız "Satış olmadı"da — çıkınca sunucu ve görev tamamlama hepsini temizler
  (`lib/domain/crm/loss-detail.ts`); satış tarihi yalnız "Satış oldu"da; tutarlar ≥ 0 (CRM_AGENT'a boşaltılır).
- Aktörler: statü TEKLIF_VERILDI / SATIS_OLDU'ya geçince sunucu oturumdaki personeli `offer_by` / `sold_by`'a yazar
  (gövdeden okunmaz; `crm_leads_actor` tetikleyicisi görev tamamlama gibi SQL yollarını da `updated_by`'dan doldurur,
  satıştan çıkınca `sold_by` silinir). DTO `offerBy/offerByName/soldBy/soldByName`; detayda "Teklifi veren / Satışı yapan".
- İçe aktarma: Adaylar → "İçe aktar" (sunucu `dryRun` raporu, sonra onay) → [cold-lists-import.md](cold-lists-import.md).
- Satış Analizleri: satış hunisi, aylık / müşteri kırılımları.
