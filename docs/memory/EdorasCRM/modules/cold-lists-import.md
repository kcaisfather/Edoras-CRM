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
  Görev YAZMAZ, adayı gizlemez (sorumlusuz, sonraki arama yok — Adaylar'da en üstte). Kaydedince `MoveToCrmDialog` Adaylar'a
  gider ve adayın panelini açar (`/crm?lead=<id>`, 12.10); listede kaydedilmemiş arama sonucu varsa sayfada kalır, toast'ta
  "Adaylar'da aç". Aranacak / Takipte açılan aday Görevlerim'de de hemen görünür: kural motorunun "Tarihsiz Aranacak /
  Takipte" görevi (`undatedFollowUp`, varsayılan +0 gün, istekte türetilir — [tasks-rules.md](tasks-rules.md)); bu tasarım
  gereği, kapatmak / ertelemek Ayarlar → Kurallar (ADMIN) ya da adaya sonraki arama tarihi girmek.
- **"Kişi ekle"** (araç çubuğu, `AddProspectDialog`): seçili listeye tek kişi — `POST /api/crm/prospect-lists/{id}/prospects`
  (`createProspect`, şema `prospectCreateSchema`). İçe aktarmadan farkı: en az bir kimlik alanı ve GEÇERLİ telefon / e-posta
  zorunlu (geçersiz ham değer saklanmaz); aynı listede aynı telefon / e-posta → 409 `PROSPECT_DUPLICATE`; CRM / kurum
  mükerreri engellemez. İşlem kaydı `PROSPECT_CREATED`.
- **"Soğuk listeye taşı"** (eski adı "Soğuk listeye geri gönder"; aday paneli eylem satırı `ReturnToColdListAction`, satırın
  İşlemler menüsü → `onReturnToColdList` → `ReturnToColdListDialog`; crm → cold-lists bağımlılığı olmasın diye `CrmScreen`
  yuvaları): `POST /api/crm/leads/{id}/cold-list { listId, lostReason }`
  (`returnLeadToColdList`), `GET` aynı yol → adayın geldiği listeler (pencere varsayılan seçer). Aday SİLİNMEZ: "Satış
  olmadı" (OLUMSUZ, seçilen kayıp nedeni, sonraki arama null — `updateLead` ile aynı statü yolu) + "Soğuk listeye geri
  gönderildi: <liste>" notu. Listede adaya bağlı (ya da aynı telefon / e-postalı) kişi varsa taşındı işareti ve sonucu
  temizlenir (`NOT_CALLED`), yoksa adaydan yeni kişi eklenir; başka adaya bağlı eşleşme → 409 `PROSPECT_DUPLICATE`;
  müşteri (SATIS_OLDU) → 409 `LEAD_IS_CUSTOMER`. Migration YOK: kişi → not → statü sırayla, `createCompensator()` ile
  geri alınır. İşlem kaydı `LEAD_RETURNED_TO_COLD_LIST`.
- **Toplu "Soğuk listeye taşı"** (12.10; Adaylar toplu işlem çubuğu → "Seçilenleri soğuk listeye taşı (N)",
  `BulkReturnToColdListButton`, yuva `renderBulkActions`): `POST /api/crm/leads/cold-list { leadIds (≤ 200), listId,
  lostReason }` → `{ moved, restored, skipped: [{ id, code }] }` (`returnLeadsToColdList`, şema `leadsToColdListSchema`).
  Liste bir kez okunur (yoksa 404); adaylar SIRAYLA tekil yolla (`returnLeadToList` — aynı kurallar, aynı geri alma, aday
  başına işlem kaydı); hata veren atlanır (müşteri `LEAD_IS_CUSTOMER`, mükerrer `PROSPECT_DUPLICATE`, silinmiş `NOT_FOUND`).
  İstemci seçimi 25'erli parçalarla gönderir, düğmede ilerleme; toast "N aday taşındı, M atlandı" + neden dökümü.
  Saf parçalar + test: `lib/domain/cold-lists/bulk-return.ts`. Tek aday seçiliyse tekil uç kullanılır. Migration YOK.
- KVKK envanterinde listelidir (Ayarlar → KVKK).

## Detaylı filtre (12.10)

- Arama kutusunun yanında **"Filtreler (n)"** → altında tam genişlik panel (yerel `useState`, varsayılan kapalı) + panel
  kapalıyken de görünen etkin süzgeç çipleri ("İl: Edirne") ve süzgeç / arama varken "{gösterilen} / {toplam} kişi".
  UI: `features/cold-lists/components/ProspectDetailFilters.tsx` (ortak yapı taşları `components/list/filter-panel.tsx`).
- Alanlar (VE ile) ve URL parametreleri: İl `city`, İlçe `district` (ikisi tam eşleşme; seçenekler yalnız listedeki
  değerler, ilçe seçili ilin ilçeleri; **il değişince ilçe silinir** — tek URL yazımı `useUrlParamsSetter`), Telefon
  `phone` (rakamlar; E.164 + ham, baştaki 0 yok sayılır), E-posta `email`, Kurum `org`, Ad soyad `name`, Not `note`
  (içerme), Program / tür `branch` (tam eşleşme), Telefon kaydı `hasPhone`, E-posta kaydı `hasEmail`, CRM'de kayıtlı
  `inCrm` (`yes` / `no`; CRM'de = taşınmış ve adayı duruyor YA DA aynı telefon / e-postayla CRM adayı / kurum kaydı).
  Karşılaştırma Türkçe duyarlı (`lib/utils/filter-match.ts`: "EDİRNE" = "Edirne").
- Sıra (`useColdListView`): detay süzgeci + serbest arama (`?q=`) → **sekme sayıları bundan sayılır** ("Aranmadı (12)" =
  süzgece uyan 12 kişi) → sonuç sekmesi (`?outcome=`). CSV dışa aktarma `view.filtered`'ı kullanır, süzgeçleri izler.
  Süzgeç değişince sayfa başa döner; liste değişince süzgeçler korunur (URL'de).
- Saf mantık `lib/domain/cold-lists/utils.ts` (`filterProspects`, `prospectMatchesQuery`, `ProspectDetailFilter`; testler
  `cold-lists.test.ts`). Serbest arama artık Türkçe duyarlı ve telefon gibi görünen sorguyu ("0532 123") yazım
  farkından bağımsız eşler. CRM dizini kancada durur → `hasCrmMatch` geri çağırması olarak verilir.
