import { ok, requireStaff, route } from "@/lib/api/server";
import { listEdorasOpenQuestionObjections } from "@/lib/server/edoras";

export const dynamic = "force-dynamic";

/** Öğrencilerin açık soru itirazları, soruya göre toplu. Yalnız ADMIN. */
export const GET = route(async () => {
  await requireStaff({ role: "ADMIN" });
  return ok(await listEdorasOpenQuestionObjections());
});
