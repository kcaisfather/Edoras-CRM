import { HttpError, ok, route } from "@/lib/api/server";
import { checkCronAuth } from "@/lib/server/cron-auth";
import { isMailConfigured } from "@/lib/server/mail";
import { dispatchDueReports } from "@/lib/server/reports";

export const dynamic = "force-dynamic";
/** Sunucusuz dağıtımda (Vercel) çalışma süresi üst sınırı; dağıtıcı ~40 sn sonra yeni abonelik başlatmaz. */
export const maxDuration = 60;

/**
 * Rapor dağıtıcısı: çalışma zamanı gelmiş aktif abonelikleri gönderir. Oturumsuzdur (proxy.ts `CRON_PATHS`); tek yetki
 * `Authorization: Bearer ${CRON_SECRET}`. CRON_SECRET tanımsızsa 503 CONFIG_MISSING, e-posta ayarsızsa 503
 * MAIL_NOT_CONFIGURED (hiçbir abonelik talep edilmez, sonraki tetiklemede gönderilir). İdempotenstir: aynı anda ya da
 * art arda çağrılsa da bir çalışma bir kez gider. GET, Vercel Cron içindir (o GET gönderir); POST, pg_cron + pg_net
 * ya da harici zamanlayıcı içindir. Yanıtta yalnız sayılar var.
 */
const dispatch = route(async (request: Request) => {
  const auth = checkCronAuth(request.headers.get("authorization"), process.env.CRON_SECRET);
  if (auth === "not-configured") throw new HttpError(503, "CONFIG_MISSING", undefined, "env:CRON_SECRET");
  if (auth === "unauthorized") throw new HttpError(401, "UNAUTHORIZED");
  if (!isMailConfigured()) throw new HttpError(503, "MAIL_NOT_CONFIGURED");
  return ok(await dispatchDueReports());
});

export const GET = dispatch;
export const POST = dispatch;
