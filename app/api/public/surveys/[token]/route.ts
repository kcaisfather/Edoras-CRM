import { ok, route } from "@/lib/api/server";
import { openPublicSurvey, publicRateLimit } from "@/lib/server/public-surveys";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

/**
 * HERKESE AÇIK (oturum yok, proxy.ts dokunmaz): anket başlığı, giriş metni, sorular ve alıcının ilk adı. İlk açılışta
 * davet OPENED olur. Geçersiz token 404, süresi dolmuş 410, yanıtlanmış 409, oran sınırı 429 — asla 401.
 */
export const GET = route(async (request: Request, { params }: Ctx) => {
  const { token } = await params;
  const limited = publicRateLimit(request, token, "read");
  if (limited) return limited;
  return ok(await openPublicSurvey(token));
});
