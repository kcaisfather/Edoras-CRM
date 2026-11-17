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

## Haiku ön inceleme (17.11, soru + bilgi kartı destesi ortak)
- Uçlar: `GET|POST /api/cron/question-pool/review` ve `/api/cron/flashcard-pool/review` (Bearer `CRON_SECRET`). GET = `status=PENDING and ai_reviewed_at is null` (en eski önce, `?limit=`); POST = `{model, results:[{id, verdict ONAY|RED|BELIRSIZ, confidence 0..1, reason}]}` (≤200; gece işi 25'erli yollar: her satır panel aktarımı yapabilir, 60 sn sınırı).
- Satıra yazılan: `ai_verdict/ai_confidence/ai_reason/ai_model/ai_reviewed_at`; denetlenen satır bir daha çekilmez (POST `ai_reviewed_at is null` ister, idempotent). Arayüzde `features/ai-review` `AiReviewBadge`.
- Otomatik karar (varsayılan KAPALI, CRM ortam bayrakları): `AI_REVIEW_AUTO_REJECT=1`, `AI_REVIEW_AUTO_APPROVE=1`, eşik `AI_REVIEW_MIN_CONFIDENCE` (0.9). Saf kural `lib/domain/ai-review/rules.ts`. Karar çekirdeği `decideCore(actor)`: insan = `reviewed_by` dolu, Haiku = `reviewed_by` BOŞ + `auto_reviewed=true` (migration `20261117120000` kısıtı gevşetti: ya insan ya otomatik). Audit: `recordSystemAudit(…, "Haiku ön inceleme")`. Otomatik onay panele GEÇMEZ ise (kazanım eşleşmedi) geri alınıp insana bırakılır.
- Süzgeç + gerekçe kutusu (17.11, 490636e): `AiReviewBadge/AiReviewNote/AiReviewFilterBar`, sayaçlar `lib/server/ai-review-counts.ts`, süzgeç `parseAiFilter` (`rules.ts`), uçlar `?ai=` + `?summary=1`. RED incelemesi: sorularda Haiku LLM üretiminde 6/6 haklı, AIG'de 0/4; destelerde 18'in ~6'sı gerçek ret, kalanı tek kart sorunu. Karar: otomatik RED yalnız LLM sorulara (`questionAutoRejectEligible`), desteye hiç (`DECK_AUTO_REJECT_ALLOWED=false`); `autoAction(item, flags, allowReject)`.
- Formül ağırlıklı ders desteleri (Matematik/Geometri/Fizik/Kimya) otomatik karar almaz. Onayı geri alma (`revoke`) otomatik onaylar için de çalışır (`auto_reviewed` sıfırlanır).
