# Soru havuzu (Mini Test / Düello soru onayı)

Gece üreticisi (`edoras-soru-havuzu`) soru partisini CRM'e gönderir (`crm_question_pool`); CRM'de onaylanan soru panelin
`mini_test_questions` tablosuna yazılır (`lib/server/question-pool.ts`, `lib/server/edoras.ts`), "Onayı geri al" panelde
`active=false` yapar. Panel tarafı: YKS deposu `docs/memory/YKS/modules/mini-test.md` + `duel.md`.

## Sınav alanı `program` (yks | lgs) — 2026-11-11, plan Ls7nGsrd F4.1 adım 1

- **Üretimde belirlenir, CRM tahmin etmez.** Ingest şemasında (`lib/domain/question-pool/schemas.ts`) `program`
  ZORUNLU: eksik gelen parti 400 ile düşer. Tanım `QUESTION_PROGRAMS` (`rules.ts`).
- **Eşleştirme önce sınava bakar** (`objective-match.ts matchPoolObjective(subject, candidates, program)`): adayın
  programı MEB listesinin adından (`programFromMebList`), konu kazanımında kategoriden, yayıncı kazanımında sınıf
  düzeyinden / ders önekinden (`programFromPublisher`; 9–12/TYT/AYT/YDT/Mezun → yks, 1–8/LGS → lgs) çıkar.
  Programı bilinmeyen aday ELENMEZ. Ders anahtarı "LGS " önekini de atar.
- Onay programı panele aynen taşır (panel migration 384 `mini_test_questions.program`, NOT NULL). ÖSYM kod eşlemesi
  yalnız `yks` sorusuna uygulanır. Onay ekranında YKS/LGS etiketi (`QuestionPoolReview.tsx`).
- Migration `20261111120000_crm_question_pool_program.sql`: 11.11'de canlıdaki 233 satırın hepsi YKS üreticisinden →
  `'yks'` ile doldurulur, sonra NOT NULL + check. Varsayılan YOK.

## Yayın sırası (program)

1. Üretici push (program gönderen sürüm; eski CRM fazla alanı yok sayar).
2. Panel `384_mini_test_question_program.sql` (TR, `infra/tr/tr-migration.sh <dosya> --uygula`).
3. Bu deponun migration'ı (`infra/tr/tr-migration.sh --crm <dosya> --uygula`).
4. CRM push `main` + `kamil`, panel push `main` + `Kamil`.

2–4 arka arkaya: 384'ten sonra eski CRM'in onayı (program göndermeden yazar) panelde NOT NULL'a takılır.
