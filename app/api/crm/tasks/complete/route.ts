import { ok, parseBody, requireStaff, route } from "@/lib/api/server";
import { completeTaskSchema } from "@/lib/domain/tasks/schemas";
import { completeTask } from "@/lib/server/crm-tasks";

export const dynamic = "force-dynamic";

/**
 * Görevi tamamla — tek transaction: görev, sonuç notu, adayın statüsü / sonraki arama tarihi. Elle atanan görev
 * `taskId` ile; kural görevi `derived` (anahtar + tür + özne + vade) ile — sunucu görevi yeniden türetip doğrular.
 */
export const POST = route(async (request: Request) => {
  const staff = await requireStaff();
  return ok(await completeTask(await parseBody(request, completeTaskSchema), staff));
});
