import { HttpError, ok, parseBody, requireStaff, route } from "@/lib/api/server";
import { assignTaskSchema, taskQuerySchema } from "@/lib/domain/tasks/schemas";
import { assignTask, listTasks } from "@/lib/server/crm-tasks";

export const dynamic = "force-dynamic";

/**
 * Görevlerim (her CRM kullanıcısı): `?from&to&status=OPEN|DONE`. Açık kural görevleri istekte türetilir;
 * tamamlananlar ve elle atananlar crm_tasks'tan. Atanmış görev yalnız atanana ve yöneticiye döner.
 */
export const GET = route(async (request: Request) => {
  const staff = await requireStaff();
  const sp = new URL(request.url).searchParams;
  const query = taskQuerySchema.safeParse({ from: sp.get("from"), to: sp.get("to"), status: sp.get("status") });
  if (!query.success) throw new HttpError(400, "VALIDATION");
  return ok(await listTasks(staff, query.data));
});

/** "Görev ata" (her CRM kullanıcısı). CRM_AGENT yalnız kendine ya da havuza atar; aktör oturumdan. */
export const POST = route(async (request: Request) => {
  const staff = await requireStaff();
  return ok(await assignTask(await parseBody(request, assignTaskSchema), staff), 201);
});
