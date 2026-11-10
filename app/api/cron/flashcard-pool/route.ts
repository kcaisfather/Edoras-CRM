import { HttpError, ok, parseBody, route } from "@/lib/api/server";
import { checkCronAuth } from "@/lib/server/cron-auth";
import { flashcardIngestBatchSchema } from "@/lib/domain/flashcard-pool/schemas";
import { ingestFlashcardBatch, listCoveredObjectiveIds } from "@/lib/server/flashcard-pool";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function requireCron(request: Request) {
  const auth = checkCronAuth(request.headers.get("authorization"), process.env.CRON_SECRET);
  if (auth === "not-configured") throw new HttpError(503, "CONFIG_MISSING", undefined, "env:CRON_SECRET");
  if (auth === "unauthorized") throw new HttpError(401, "UNAUTHORIZED");
}

/**
 * Bilgi kartı gece yazıcısı (`edoras-soru-havuzu`). Oturum yok; tek yetki `Authorization: Bearer ${CRON_SECRET}`.
 * İdempotent: aynı gece ikinci kez gelirse `alreadyRun: true` döner, hiçbir deste yazılmaz. Yanıt yalnız sayılar içerir.
 */
export const POST = route(async (request: Request) => {
  requireCron(request);
  return ok(await ingestFlashcardBatch(await parseBody(request, flashcardIngestBatchSchema)));
});

/** Gece işi üretmeden önce sorar: destesi olan ya da kartsız kalan kazanımların kimlikleri. */
export const GET = route(async (request: Request) => {
  requireCron(request);
  return ok({ covered: await listCoveredObjectiveIds() });
});
