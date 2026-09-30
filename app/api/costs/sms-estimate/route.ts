import { ok, requireStaff, route } from "@/lib/api/server";
import { monthOfDay } from "@/lib/domain/costs/months";
import { monthQuerySchema } from "@/lib/domain/costs/schemas";
import { todayIso } from "@/lib/domain/institutions/rules";
import { getSmsEstimate } from "@/lib/server/costs";

export const dynamic = "force-dynamic";

/** Edoras sms_logs alıcı sayısı × birim fiyat = TAHMİNİ SMS maliyeti (?month=YYYY-MM). Salt okunur; deftere yazılmaz. Yalnız ADMIN. */
export const GET = route(async (request: Request) => {
  await requireStaff({ role: "ADMIN" });
  const { month } = monthQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
  return ok(await getSmsEstimate(month ?? monthOfDay(todayIso())));
});
