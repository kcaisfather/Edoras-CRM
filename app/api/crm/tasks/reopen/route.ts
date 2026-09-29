import { ok, parseBody, requireStaff, route } from "@/lib/api/server";
import { reopenTaskSchema } from "@/lib/domain/tasks/schemas";
import { reopenTask } from "@/lib/server/crm-tasks";

export const dynamic = "force-dynamic";

/** "Geri al" — yalnız tamamlayan ya da ADMIN (403 TASK_NOT_COMPLETER). Not ve aday değişiklikleri geri alınmaz. */
export const POST = route(async (request: Request) => {
  const staff = await requireStaff();
  const { taskId } = await parseBody(request, reopenTaskSchema);
  await reopenTask(taskId, staff);
  return ok({ ok: true });
});
