import { HttpError, ok, parseBody, route } from "@/lib/api/server";
import { checkCronAuth } from "@/lib/server/cron-auth";
import { ingestBatchSchema } from "@/lib/domain/question-pool/schemas";
import { ingestQuestionBatch } from "@/lib/server/question-pool";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Gece yazıcısı (YKS `scripts/nightly-question-pool.ts`). Oturum yok; tek yetki `Authorization: Bearer ${CRON_SECRET}`.
 * İdempotent: aynı gece + kaynak ikinci kez gelirse `alreadyRun: true` döner, hiçbir soru yazılmaz.
 * Yanıt yalnız sayılar içerir; soru metni geri dönmez.
 */
export const POST = route(async (request: Request) => {
  const auth = checkCronAuth(request.headers.get("authorization"), process.env.CRON_SECRET);
  if (auth === "not-configured") throw new HttpError(503, "CONFIG_MISSING", undefined, "env:CRON_SECRET");
  if (auth === "unauthorized") throw new HttpError(401, "UNAUTHORIZED");
  return ok(await ingestQuestionBatch(await parseBody(request, ingestBatchSchema)));
});
