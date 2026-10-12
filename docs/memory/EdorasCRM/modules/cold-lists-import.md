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
- **"Kişi ekle"** (araç çubuğu, `AddProspectDialog`): seçili listeye tek kişi — `POST /api/crm/prospect-lists/{id}/prospects`
  (`createProspect`, şema `prospectCreateSchema`). İçe aktarmadan farkı: en az bir kimlik alanı ve GEÇERLİ telefon / e-posta
  zorunlu (geçersiz ham değer saklanmaz); aynı listede aynı telefon / e-posta → 409 `PROSPECT_DUPLICATE`; CRM / kurum
  mükerreri engellemez. İşlem kaydı `PROSPECT_CREATED`.
- **"Soğuk listeye geri gönder"** (aday paneli eylem satırı, `ReturnToColdListAction`; crm → cold-lists bağımlılığı olmasın
  diye `CrmScreen` → `renderSheetActions` yuvası): `POST /api/crm/leads/{id}/cold-list { listId, lostReason }`
  (`returnLeadToColdList`), `GET` aynı yol → adayın geldiği listeler (pencere varsayılan seçer). Aday SİLİNMEZ: "Satış
  olmadı" (OLUMSUZ, seçilen kayıp nedeni, sonraki arama null — `updateLead` ile aynı statü yolu) + "Soğuk listeye geri
  gönderildi: <liste>" notu. Listede adaya bağlı (ya da aynı telefon / e-postalı) kişi varsa taşındı işareti ve sonucu
  temizlenir (`NOT_CALLED`), yoksa adaydan yeni kişi eklenir; başka adaya bağlı eşleşme → 409 `PROSPECT_DUPLICATE`;
  müşteri (SATIS_OLDU) → 409 `LEAD_IS_CUSTOMER`. Migration YOK: kişi → not → statü sırayla, `createCompensator()` ile
  geri alınır. İşlem kaydı `LEAD_RETURNED_TO_COLD_LIST`.
- KVKK envanterinde listelidir (Ayarlar → KVKK).
