import { ok, parseBody, requireStaff, route } from "@/lib/api/server";
import { reportSubscriptionInputSchema } from "@/lib/domain/reports/schemas";
import { createSubscription, listSubscriptions } from "@/lib/server/reports";

export const dynamic = "force-dynamic";

/** Rapor abonelikleri (alıcı kimlikleri, sıklık, sonraki çalışma, son gönderim). Yalnız ADMIN. */
export const GET = route(async () => {
  await requireStaff({ role: "ADMIN" });
  return ok(await listSubscriptions());
});

/** Abonelik ekle. Alıcılar aktif CRM personeli olmalı. Yalnız ADMIN. */
export const POST = route(async (request: Request) => {
  const staff = await requireStaff({ role: "ADMIN" });
  return ok(await createSubscription(await parseBody(request, reportSubscriptionInputSchema), staff), 201);
});
