# Müşteri analizleri

Ekran: `/growth/customers` (Müşteri Takibi — CRM_AGENT'a açık), `/growth/analytics` (Müşteri Analizleri — yalnız ADMIN);
kurum ayrıntısında başlıktaki "Etkinlik" / "Son etkinlik" kutucukları (`InstitutionActivityHighlights`) ve Genel bakış
yan sütununda "Özellik kullanımı" kartı (`InstitutionUsageCard`; kaynak başına sayı + son gün, nokta = son kullanımdan bu
yana süre; ADMIN'e "Etkinlik geçmişi" → `/activity-history?inst=<id>`). İkisi aynı sorgu (React Query tek istek). Uçlar: `/api/growth/customers?window=`, `/api/growth/weekly?weeks=`,
`/api/growth/institutions/{id}/usage`. Sunucu: `lib/server/growth.ts`, Edoras okuma `lib/server/edoras-usage.ts`.
Tanımlar: `lib/domain/growth/{usage,renewals,retention,campaign,sort}.ts`. **Migration yok.**

- **Kullanım = etkinlik** (Edoras'ta "son giriş" yok): yoklama (`attendance_sessions.date`, en iyi sinyal), konu işleme,
  ödev, deneme oluşturma, duyuru, elle SMS (`send_type='auto'` hariç). Bilinçli kullanılmayan: `exam_results.created_at`,
  `student_assignments`, `user_notifications.read_at`, `user_devices.last_seen_at`, `auth.users.last_sign_in_at`.
- Kullanıyor = son 14 günde etkinlik; hazır süzgeçler 14+ / 30+ gün yok, "Hiç aktive olmamış" (30+ günlük, hiç etkinlik),
  "Öğrenci eklememiş", "Öğretmeni yok", "90+ gün girmeyen ödeyenler".
- Maliyet: kurum başına ≈ 18 istek, eşzamanlı 10 (`lib/utils/limiter.ts`), sonuç 5 dk bellekte. Okunamayan kaynak `unavailable`.
- Yenileme / retention `crm_licenses`'tan kesin: bitişten sonra 30 gün içinde yeni lisans = yenilendi, yoksa churn; kohort
  ilk lisans ayı. Birim ekonomisi ve sızıntı yalnız ADMIN.
- Kampanya: WhatsApp bağlantıları + CSV (e-posta kampanyası yok — onay / çıkış kaydı yok).
- **Öğretmen kullanımı kartı (2026-10-09, dal `ogretmen-kullanim-2026-10-09`):** kurum ayrıntısında **"Öğretmen kullanımı" sekmesi**
  (`InstitutionDetailPage` → `staff` yuvası, 2026-10-12'den beri; önce `footer` idi — sekme açılmadan RPC çağrılmaz), uç `/api/growth/institutions/{id}/staff-activity?window=7|30|90|0` (0 = Tümü, 2026-10-26), sunucu
  `getStaffActivity` (`edoras-usage.ts` sonu), saf mantık `lib/domain/growth/staff-activity.ts` (+ test). Kaynak Edoras RPC
  `staff_activity_summary` (edoras-admin migration 305 — CRM'den önce Edoras canlısına uygulanmalı; yoksa kart "okunamadı").
  Personel × işlem (yoklama, ödev, ödev kontrolü, birebir, deneme, duyuru, elle SMS, konu, mobil oturum); hücre = işlem
  (aynı dakika = 1), "Aktif gün" RPC'nin kişi başı `total` satırından (işlemler arasında toplanmaz). İşlemsiz etkin
  personel de listelenir. Maliyet: kart başına 3 istek (RPC + `institution_users` + `profiles`), 5 dk önbellek.
  **Ödev iki sütun (2026-10-12, dal `odev-paket-2026-10-12`, Edoras migration 315):** "Ödev paketi" = RPC `assignment`
  satırının `session_count`'u = farklı (hedef, OLUŞTURMA haftası); hedef bireysel ödevde öğrenci, sınıf ödevinde sınıf
  (sınıf × hafta = 1). "Tekil görev" = `event_count` = öğrenciye düşen görev (`student_assignments`; sınıf ödevi 30 öğrenciye
  = 30). Kütüphane şablonu (`due_date` NULL) ikisinde de yok. Hangi sütun hangi ölçü: `COLUMN_METRIC` + `cellValue` (kart,
  CSV, mobil). Toplam "işlem" (sıralama) paketi BİR kez toplar. Aynı şablon süzgeci kurum kullanım kartında (`SOURCES`
  `notNullColumn`, haftalık seri dahil) ve Kurum etkinliği akışında (`ASSIGNMENT_CREATED`) da var. Bakırköy 30 gün: Enes
  1.057 (eski dakika) → 143 paket / 5.161 tekil. RPC 90 gün sıcak ≈ 265 ms (eşik 500).
  **26.10 güncellemesi (Edoras migration 338, CRM'den ÖNCE uygulanmalı — eski RPC "Tümü"de 180 gün hatası verir):**
  "Tümü" penceresi (`STAFF_WINDOW_ALL` = 0 → `since` = `STAFF_ALL_SINCE`; `parseStaffWindow`); sütun sırası Yoklama →
  **Konu işleme** → Ödev paketi → Tekil görev → **Onaylanan görev** (`review_approved`, adet = görev; "Ödev kontrolü"
  dakikayı 1 sayar) → Ödev kontrolü → … → Mobil oturum → **Web oturum** (`web`; panel middleware'in yazdığı
  `web_sessions`, giriş oturumu × gün; 26.10'dan önce boş). Mobil, web ve onaylanan görev "işlem" toplamına GİRMEZ
  (`NOT_AN_ACTION`). Her sütun başlığı `InfoTip` tetikleyicisi (`trigger` prop'u, noktalı alt çizgi) → `colHints.*`
  açıklaması. Canlı (Bakırköy): Tümü 1,1 sn soğuk / 30 gün 0,7 sn.
  **Yapışkan başlık (26.10, df972d5):** tablo kendi kabında kayar (`Table` → `containerClassName` = `max-h-[70vh]`);
  başlık satırı `sticky top-0`, Personel sütunu `sticky left-0` (td'de opak `bg-card`), köşe hücre z-30. Kaydırma
  sayfaya bırakılırsa `th` yapışmaz — kap yüksekliğini kaldırma.
  **28.10 — onay sütunları (Edoras migration 343, CRM'den ÖNCE uygulandı):** ödev dört sütun: **Toplu ödev**
  (eski "Ödev paketi") → **Toplu ödev onayı** (`assignmentApproved` = `review_approved.session_count`: onaylanan görevlerin
  ait olduğu farklı paket, anahtar ödev dalıyla aynı — hedef + oluşturma haftası) → **Tekli ödev** (eski "Tekil görev") →
  **Tekli ödev onayı** (eski "Onaylanan görev", `event_count`). Onaylar onay gününe göre sayılır; ikisi de "işlem" toplamına
  GİRMEZ. 343 öncesi RPC'de `review_approved` session = dakika olduğundan eski RPC'yle "Toplu ödev onayı" yanlış olur.
  ⚠️ "Tümü"de sütunlar AYNI dönemi kapsamaz: mobil `screen_views` 180 gün budanır (238 cron) → en çok son 6 ay; web
  26.10'dan beri. İş sütunları kalıcı tablolardan, kurumun ilk gününden. Uyarı mobil/web `colHints`'te yazılı.
- Bırakılan: genişleme (koltuk), kanal sekmeleri, AWS / CAC-ROAS, telemetri `/analytics`. → [../reference/decisions.md](../reference/decisions.md)
