import { HttpError, ok, parseBody, route } from "@/lib/api/server";
import { checkCronAuth } from "@/lib/server/cron-auth";
import { aiReviewBatchSchema } from "@/lib/domain/ai-review/rules";
import { applyDeckAiReviews, listDecksForAiReview } from "@/lib/server/flashcard-pool";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function requireCron(request: Request) {
  const auth = checkCronAuth(request.headers.get("authorization"), process.env.CRON_SECRET);
  if (auth === "not-configured") throw new HttpError(503, "CONFIG_MISSING", undefined, "env:CRON_SECRET");
  if (auth === "unauthorized") throw new HttpError(401, "UNAUTHORIZED");
}

/**
 * Gece ön incelemesi (Haiku, `edoras-soru-havuzu`). Oturum yok; tek yetki `Authorization: Bearer ${CRON_SECRET}`.
 * GET: henüz denetlenmemiş bekleyen desteler (`?limit=`, en çok 100). POST: denetim sonuçları. Bayraklar
 * `AI_REVIEW_AUTO_REJECT` / `AI_REVIEW_AUTO_APPROVE` kapalıyken yalnız rozet yazılır, karar insanda kalır.
 */
export const GET = route(async (request: Request) => {
  requireCron(request);
  const limit = Math.min(100, Math.max(1, Number(new URL(request.url).searchParams.get("limit")) || 60));
  return ok({ items: await listDecksForAiReview(limit) });
});

export const POST = route(async (request: Request) => {
  requireCron(request);
  return ok(await applyDeckAiReviews(await parseBody(request, aiReviewBatchSchema)));
});
