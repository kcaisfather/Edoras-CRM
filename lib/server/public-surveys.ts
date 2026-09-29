import "server-only";

import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { HttpError, dbError } from "@/lib/api/server";
import type { ApiErrorBody } from "@/lib/api/error-codes";
import { firstNameOf } from "@/lib/domain/surveys/message";
import { isSurveyToken, type PublicAnswerValues } from "@/lib/domain/surveys/schemas";
import type { PublicSurvey, SurveyQuestion } from "@/lib/domain/surveys/types";
import { clientIp, createRateLimiter } from "./rate-limit";

/**
 * Herkese açık anket (/s/[token] sayfası ve /api/public/surveys/* uçları) — OTURUM YOK.
 *
 * - Asla 401 dönmez: geçersiz token 404, süresi dolmuş 410, yanıtlanmış 409, oran sınırı 429.
 * - service_role YALNIZ sunucuda ve yalnız crm_survey_open / crm_survey_submit için kullanılır; tarayıcıya anahtar ya
 *   da tablo erişimi gitmez. Yanıt yalnız anket başlığını, giriş metnini, soruları ve alıcının İLK adını taşır.
 * - Müşterinin yanıtı işlem kaydına yazılmaz (kişisel veri; personel işlemi değil). Hata logunda token yazılmaz.
 * - Oran sınırı: IP + token başına kayan pencere, ayrıca IP başına genel sınır (./rate-limit.ts — bellek içi, tek
 *   süreç için; çok örnekli dağıtımda paylaşılan depo gerekir).
 */

const WINDOW_MS = 10 * 60 * 1000;
/** IP + token: sayfa açılışı / yenileme. */
const readLimiter = createRateLimiter({ limit: 30, windowMs: WINDOW_MS });
/** IP + token: yanıt gönderme denemesi. */
const writeLimiter = createRateLimiter({ limit: 10, windowMs: WINDOW_MS });
/** IP başına tüm tokenlar (farklı token deneyerek sınırı aşmaya karşı). */
const ipLimiter = createRateLimiter({ limit: 120, windowMs: WINDOW_MS });

/** Oran sınırı aşıldıysa 429 yanıtı (Retry-After ile), yoksa null. */
export function publicRateLimit(request: Request, token: string, kind: "read" | "write"): Response | null {
  const ip = clientIp(request.headers);
  const perIp = ipLimiter.hit(ip);
  const perToken = (kind === "read" ? readLimiter : writeLimiter).hit(`${ip}|${token}`);
  const blocked = !perIp.ok ? perIp : !perToken.ok ? perToken : null;
  if (!blocked) return null;
  const body: ApiErrorBody = { error: { code: "RATE_LIMITED" } };
  return NextResponse.json(body, {
    status: 429,
    headers: { "Retry-After": String(blocked.retryAfterSec), "Cache-Control": "no-store" },
  });
}

/** Biçimi tutmayan token veritabanına hiç gitmeden 404. */
function requireToken(token: string): string {
  if (!isSurveyToken(token)) throw new HttpError(404, "NOT_FOUND");
  return token;
}

type OpenResult =
  | { state: "NOT_FOUND" | "ANSWERED" | "EXPIRED" }
  | { state: "OPEN"; title: string; intro: string | null; questions: SurveyQuestion[]; recipient_name: string | null };

/** Sorudan yalnız ekranın çizdiği alanlar (veritabanına ileride eklenecek başka bir alan sızmasın). */
const publicQuestion = (q: SurveyQuestion): SurveyQuestion => ({ id: q.id, type: q.type, text: q.text ?? null, required: q.required });

/** GET /api/public/surveys/{token}: davet ilk açılışta OPENED olur. */
export async function openPublicSurvey(token: string): Promise<PublicSurvey> {
  const { data, error } = await getSupabaseAdminClient().rpc("crm_survey_open", { p_token: requireToken(token) });
  if (error) throw dbError(error);
  const res = data as OpenResult;
  switch (res.state) {
    case "OPEN":
      return {
        title: res.title,
        intro: res.intro,
        questions: res.questions.map(publicQuestion),
        recipientFirstName: firstNameOf(res.recipient_name),
      };
    case "ANSWERED":
      throw new HttpError(409, "SURVEY_ANSWERED");
    case "EXPIRED":
      throw new HttpError(410, "SURVEY_EXPIRED");
    default:
      throw new HttpError(404, "NOT_FOUND");
  }
}

/**
 * POST /api/public/surveys/{token}/responses: token, süre, tek yanıt ve zorunlu sorular crm_survey_submit'te (tek
 * transaction) denetlenir; ikinci yanıt 409.
 */
export async function submitPublicSurvey(token: string, answer: PublicAnswerValues): Promise<void> {
  const { error } = await getSupabaseAdminClient().rpc("crm_survey_submit", {
    p_token: requireToken(token),
    p_nps: answer.nps,
    p_csat: answer.csat,
    p_comment: answer.comment,
  });
  if (error) throw dbError(error);
}
