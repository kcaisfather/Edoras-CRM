# CRM adayları, notlar, Satış Analizleri

Ekran: `/crm` (Adaylar), `/crm/analytics`. Uçlar: `/api/crm/leads/**`. Sunucu: `lib/server/crm-leads.ts`, `crm-notes.ts`.
DB: `crm_leads`, `crm_notes` (migration `crm_leads`).

- Liste: aşama şeridi, özet kartlar, görünümler (bekleyen demo, satış sürecinde, bakiyesi olanlar, demo bitti, yeni kayıtlar,
  olası mükerrer), detay, ekle / düzenle, CSV, toplu işlem (`/api/crm/leads/bulk`).
- Notlar: şikâyet (`SIKAYET`), devir, program etiketi.
- Adaydan **demo aç** (`/api/crm/leads/{id}/demo` → aynı demo akışı, [institutions-demo.md](institutions-demo.md)) ya da
  var olan Edoras kurumuna **bağla** (`/link`; bir kuruma en fazla bir aday — kısmi benzersiz dizin).
- Tahsilat = bağlı kurumun `crm_payments`'ı (`/collections`); kurum ayrıntısında "CRM adayı" kartı; Ana sayfada açık alacak.
- Kurallar: en az kurum adı ya da yetkili adı; telefon E.164; kayıp nedeni yalnız "Satış olmadı"da, satış tarihi yalnız
  "Satış oldu"da; tutarlar ≥ 0 (CRM_AGENT'a boşaltılır).
- İçe aktarma: Adaylar → "İçe aktar" (sunucu `dryRun` raporu, sonra onay) → [cold-lists-import.md](cold-lists-import.md).
- Satış Analizleri: satış hunisi, aylık / müşteri kırılımları.
