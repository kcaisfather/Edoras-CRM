import { ok, parseBody, requireStaff, route } from "@/lib/api/server";
import { kcaTaskCreateSchema } from "@/lib/domain/kca/types";
import { kcaCreateTask, kcaListTasks } from "@/lib/server/kca";

export const dynamic = "force-dynamic";

/** Yönetim görevleri: kişinin KCA Panel'de gördüğü Edoras projelerindeki görevler (Edoras dışı hiçbir görev gelmez). */
export const GET = route(async () => {
  const staff = await requireStaff();
  return ok(await kcaListTasks(staff));
});

/** Görev aç (KCA Panel'de görev girme yetkisi; proje Edoras'tan). → görev ayrıntısı. */
export const POST = route(async (request: Request) => {
  const staff = await requireStaff();
  return ok(await kcaCreateTask(staff, await parseBody(request, kcaTaskCreateSchema)), 201);
});
