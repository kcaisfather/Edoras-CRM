# Ayarlar ve ekip

Ekran `/settings` (sekme `?tab=`): CRM_AGENT yalnız **Genel** + **KVKK** görür; ADMIN ayrıca Ekip, Kurallar, Raporlar,
Veri kalitesi, Hata kaydı. Bileşenler `features/settings/components/`.

- **Ekip** (`/api/staff/**`, `lib/server/staff.ts`): CRM hesabı aç (CRM projesinin Auth'unda; geçici şifre bir kez
  gösterilir), rol (ADMIN / CRM_AGENT), erişimi kapat / aç, şifre sıfırla. İlk yönetici için `npm run staff:add`.
  Edoras kullanıcılarıyla ilgisi yoktur (CRM girişi ayrı projede).
- **Kurallar:** görev kural seti → [tasks-rules.md](tasks-rules.md). **Raporlar** → [reports.md](reports.md).
- **Veri kalitesi** (`/api/settings/internal-institutions/**`): iç / test kurumları işaretlenir (`crm_internal_institutions`);
  analiz, görev ve raporlardan düşer.
- **Hata kaydı** (`lib/monitoring/client-errors.ts`): istemci hataları yalnız o sekmenin `sessionStorage`'ında (kişisel veri
  maskeli) + `/api` istek sayacı. Kalıcı izleme yok — Sentry vb. kurulmadı.
- **KVKK:** işlenen kişisel veri envanteri (adaylar, soğuk liste kişileri, anket alıcıları, fatura profili…).
