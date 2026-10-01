# Soğuk listeler ve içe aktarma

Ekran: `/crm/cold-lists`, Adaylar → "İçe aktar". Uçlar: `/api/crm/prospect-lists/**`, `/api/crm/prospects/**`.
Sunucu: `lib/server/crm-prospects.ts`, `crm-import.ts`; saf kod `lib/import/`. DB: `crm_prospect_lists`, `crm_prospects`.

- Listeler ekipçe paylaşılır (DeepSport'ta tarayıcıdaydı). Herkes liste açar / içe aktarır / sonuç girer / "Sıcağa taşı" yapar;
  **listeyi yalnız ADMIN siler** (kişileriyle).
- Excel (`read-excel-file`, ilk sayfa) ve CSV (UTF-8 / Windows-1254) **tarayıcıda** okunur, dosya sunucuya gitmez; eşlenen
  ham alanlar 500'erli parça, istek başına ≤ 2000 satır ve 2 MB.
- Sunucu istemciye güvenmez: telefonu TR normalleştiriciyle (E.164), e-postayı DB kuralıyla yeniden hesaplar; mükerreri
  (aynı istek, aynı liste, CRM adayı, kurum yetkilisi) eklemez, `skipped`'te nedeniyle döner.
- "Sıcağa taşı" tek transaction (`crm_convert_prospect`): aday (kaynak COLD_LIST) + not + taşındı işareti; ikinci kez taşınmaz.
- KVKK envanterinde listelidir (Ayarlar → KVKK).
