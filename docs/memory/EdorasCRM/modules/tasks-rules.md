# Görevler ve kural motoru

Ekran: `/crm/tasks` (Görevlerim), `/crm/rules` + Ayarlar → Kurallar (yalnız ADMIN). Uçlar: `/api/crm/tasks/**`,
`/api/crm/rules`. Türetme: `lib/domain/tasks/derive.ts`, soğuk liste `lib/domain/tasks/cold.ts`. DB: `crm_tasks`, `crm_rules`.

## ⚠️ 2026-10-12 kararı: Görevlerim tamamen elle — otomatik görev KAPALI

Kullanıcı: "görevlerim'e otomatik taşıma olmasın sadece kullanıcı görevlerim kısmına ekleme yapabilir veya
kaldırabilir"; kapsam **"Hepsi — Görevlerim tamamen elle"** (10 kuralın hiçbiri görev üretmez); kaldırma yetkisi
**"Ekleyen, atanan ve yönetici"**.

- **Tek anahtar:** `RULE_TASKS_ENABLED = false` (`lib/domain/tasks/rules.ts`). Motor silinmedi; `true` yapınca eski davranış
  döner (aşağıdaki "Motor" bölümü). Liste kaynağı `composeTasks` (`derive.ts`): kapalıyken `deriveTasks` hiç çağrılmaz ve
  `crm_tasks`'taki kural görevi satırları (tamamlanmış kural görevleri — tarihçe) atılır; yalnız `kind = 'assigned'` kalır.
- Kapatılan tüketiciler (hepsi `lib/server/crm-tasks.ts` → `allTasks`; kapalıyken `loadManualTasks`, türetme girdisi —
  adaylar, kurumlar, lisanslar, ödemeler, anket davetleri, soğuk liste kişileri, kurallar — hiç okunmaz):
  Görevlerim listesi (`listTasks`), menü rozeti (`dueTaskCount`), bildirim zili (`lib/server/notifications.ts` → aynı
  sayaç), rapor e-postası / cron "Bugünkü görevler" (`listOpenTasksForReport`; satırda amaç yazılır —
  `ASSIGNMENT_TYPE_LABELS`, `lib/domain/reports/build.ts`). Panoda (`/dashboard`) görev bileşeni yok. Ekip performansı
  (`lib/server/performance.ts`) zaten `crm_tasks`'ı doğrudan okur (açık = yalnız elle atanmış).
- Tamamlama: elle görev `taskId` yolundan (türetmeye girmez). Kural görevi (`derived` gövdesi) → 404 `TASK_NOT_FOUND`.
  Tamamlanmış kural görevini "Geri al" → 404 (satır silinir ama görev yeniden türetilmezdi).
- **Görev ekle** (Görevlerim başlığı): aynı `AssignTaskDialog`, `pickLead` ile — aranabilir aday alanı (`Combobox`,
  paylaşılan aday önbelleği). Görev her zaman adaya bağlı (`crm_tasks_subject_check`); aday seçilmeden kaydedilmez. Uç
  aynı: `POST /api/crm/tasks`.
- **Kaldır** (yalnız açık elle görev; satırda çöp kutusu → onay penceresi `TaskRemoveDialog`): `DELETE /api/crm/tasks/{id}`
  → `removeTask`. Yetki `canRemoveTask` (istemci + sunucu aynı fonksiyon): ADMIN, görevi ekleyen (`created_by`) ya da
  atanan; değilse 403 `TASK_NOT_REMOVER`. Kural görevi satırı 404; tamamlanmış görev 409 `TASK_ALREADY_DONE` (iş kaydı ve
  performans sayımı korunur — önce "Geri al"). `crm_tasks`'ta iptal/durum kolonu ve silme tetikleyicisi yok → satır
  koşullu silinir (`status = 'OPEN'`; yarışta 404), iz işlem kaydında `TASK_REMOVED` (not metni yazılmaz). **Migration yok.**
- `crm_rules` verisi değişmedi; Kurallar ekranı çalışır ve üstte "Otomatik görev kapalı" notu gösterir. Başka yerde hâlâ
  kullanılan değerler: `offer` / `lostRecontact` günü → statü seçilince önerilen sonraki arama (`followUpSuggestDays`),
  `surveyNoResponse` günü → Anketler'deki "yanıt bekliyor" eşiği. Diğer kuralların şu an etkisi yok.
- Görevlerim'e otomatik düşme vaat eden metinler anahtara bağlandı (`…Manual` varyantı): Soğuk Listeler (not, kayıt onayı,
  kişi ekle, soğuk listeye taşı, içe aktarma ipucu), aday formundaki "Sonraki arama tarihi" ipucu, Anketler özeti.
  KVKK envanterindeki (`shell.tr.json`) "Görevlerim (… araması)" ekran adları değiştirilmedi.
- Yeniden açarken: `RULE_TASKS_ENABLED = true` yeterli (metinler, sunucu ve Kurallar notu kendiliğinden döner); testlerdeki
  "varsayılan false" beklentisi (`derive.test.ts`) güncellenir.

## Motor (anahtar açıkken)

**Zamanlayıcı yok.** Açık kural görevleri tabloya yazılmaz; her istekte CRM verisinden türetilir. `crm_tasks`'ta yalnız
elle atanan görevler ve tamamlanmış kural görevleri durur (anahtar `tür:özne:vade`).

- Kural seti (demo ve lisans 1 yıl): Planlanan arama, Teklif +3, Demo bitişine 30 gün kala, Lisans bitişine 60 gün kala,
  Süresi doldu +0, Açık bakiye +7, Satış olmadı +90, **Tarihsiz Aranacak/Takipte +0** (`undatedFollowUp`, DeepSport
  2026-09-27), Soğuk liste (aranmamış bugün, ulaşılamayan +2), Anket araması (yanıtsız davet, gönderimden +5).
- Tamamlama tek transaction (`crm_complete_task`): görev + sonuç notu + aday statüsü / sonraki arama. Sunucu görevi
  yeniden türetir; bugün açık değilse 404. Geri al: tamamlayan ya da ADMIN.
- Görünürlük: kural görevleri ve atanmamışlar ekip havuzu; atanmış görev atanan + ADMIN. ADMIN herkese, CRM_AGENT
  kendine / havuza atar. Elle görev geçmiş güne atanamaz (`crm_tasks_guard`).
- Soğuk liste görevi = kişinin arama sonucunu girmek; aynı anda en çok 50 kişi; menü rozeti soğuk listeyi saymaz.
- İç kurumlar görev üretmez. "En iyi arama saati" taşınmadı.

## Elle görev (her zaman)

- "Görev ata" / "Arama listesine ekle": aday satırının tek İşlemler menüsü ve aday paneli (`onAssignTask` → `AssignTaskDialog`, `onAddToCallList` → `useAddToCallList`: bugüne, "arama", notsuz, havuz); Görevlerim → "Görev ekle" (aday seçtirir). Mükerrer görev: `assignTask` aynı aday + gün + amaç + atanan için açık görev varsa 409 `TASK_DUPLICATE` döner (kodda kontrol; şema değişmedi); "Arama listesine ekle" bunu "zaten listede" olarak bildirir, aynı aday için sürmekte olan istek varken ikinci tıklama yok sayılır.
