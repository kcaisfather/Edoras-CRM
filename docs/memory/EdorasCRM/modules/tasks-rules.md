# Görevler ve kural motoru

Ekran: `/crm/tasks` (Görevlerim), `/crm/rules` + Ayarlar → Kurallar (yalnız ADMIN). Uçlar: `/api/crm/tasks/**`,
`/api/crm/rules`. Türetme: `lib/domain/tasks/derive.ts`, soğuk liste `lib/domain/tasks/cold.ts`. DB: `crm_tasks`, `crm_rules`.

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
