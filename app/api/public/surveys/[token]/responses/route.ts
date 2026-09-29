import { ok, parseBoundedBody, route } from "@/lib/api/server";
import { PUBLIC_ANSWER_MAX_BYTES, publicAnswerSchema } from "@/lib/domain/surveys/schemas";
import { publicRateLimit, submitPublicSurvey } from "@/lib/server/public-surveys";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

/**
 * HERKESE AÇIK yanıt: `{ nps, csat, comment }` (gövde ≤ 16 KB, aynı origin) → 201. Geçersiz token 404, süresi dolmuş
 * 410, ikinci yanıt 409, oran sınırı 429, hatalı yanıt 400 — asla 401. Yanıt işlem kaydına yazılmaz.
 */
export const POST = route(async (request: Request, { params }: Ctx) => {
  const { token } = await params;
  const limited = publicRateLimit(request, token, "write");
  if (limited) return limited;
  const answer = await parseBoundedBody(request, publicAnswerSchema, PUBLIC_ANSWER_MAX_BYTES);
  await submitPublicSurvey(token, answer);
  return ok({ ok: true }, 201);
});
