# Müşteri analizleri

Ekran: `/growth/customers` (Müşteri Takibi — CRM_AGENT'a açık), `/growth/analytics` (Müşteri Analizleri — yalnız ADMIN);
kurum ayrıntısında "Kullanım" kartı. Uçlar: `/api/growth/customers?window=`, `/api/growth/weekly?weeks=`,
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
- Bırakılan: genişleme (koltuk), kanal sekmeleri, AWS / CAC-ROAS, telemetri `/analytics`. → [../reference/decisions.md](../reference/decisions.md)
