import { ok, requireStaff, route } from "@/lib/api/server";
import { listActivityInstitutions } from "@/lib/server/activity";

export const dynamic = "force-dynamic";

/** Kurum etkinliği süzgeci için kurum seçenekleri (iç / sunum kurumları hariç). Yalnız ADMIN. */
export const GET = route(async () => {
  await requireStaff({ role: "ADMIN" });
  return ok(await listActivityInstitutions());
});
